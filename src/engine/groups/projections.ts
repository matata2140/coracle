import {getPublicKey} from "nostr-tools"
import {uniq, prop, groupBy, sortBy, without, whereEq, reject} from "ramda"
import {first, updateIn} from "hurdak"
import {Tags} from "src/util/nostr"
import {tryJson} from "src/util/misc"
import {updateRecord, updateStore} from "src/engine/core/commands"
import {projections} from "src/engine/core/projections"
import type {Event} from "src/engine/events/model"
import {EventKind} from "src/engine/events/model"
import {_events} from "src/engine/events/state"
import {sessions} from "src/engine/session/state"
import {nip59} from "src/engine/session/derived"
import type {GroupMeta} from "./model"
import {groups, groupSharedKeys, groupAdminKeys, groupRequests} from "./state"
import {getRecipientKey} from "./utils"

const handleGroupRequest = (group, e) => {
  // If they're not an admin, they don't care
  if (!groupAdminKeys.key(group).exists()) {
    return
  }

  groupRequests.update($requests => {
    const newRequest = {...e, group, resolved: false}

    // Only keep the most recent request per user
    return Object.values(groupBy(prop("pubkey"), $requests.concat(newRequest))).map(rx =>
      first(sortBy(e => -e.created_at, rx))
    )
  })
}

// Group meta
projections.addHandler(10024, (e: Event) => {
  const meta = tryJson(() => JSON.parse(e.content)) as Partial<GroupMeta>

  groups.key(e.pubkey).update($group => ({
    pubkey: e.pubkey,
    published_at: Math.min($group?.published_at || 0, e.created_at),
    ...updateRecord($group, e.created_at, {
      relays: Tags.from(e).relays(),
      meta: {...$group?.meta, ...(meta || {})},
    }),
  }))
})

// Group moderators
projections.addHandler(10025, (e: Event) => {
  updateStore(groups.key(e.pubkey), e.created_at, {
    moderators: Tags.from(e).type("p").values().all(),
  })
})

// Handle key rotation events
projections.addHandler(24, (e: Event) => {
  const tags = Tags.from(e)
  const privkey = tags.getMeta("privkey")

  if (privkey) {
    const pubkey = getPublicKey(privkey)

    groups.key(e.pubkey).merge({
      access_requested: null,
    })

    groupSharedKeys.key(pubkey).set({
      pubkey,
      privkey,
      group: e.pubkey,
      members: tags.type("p").values().all(),
      created_at: e.created_at,
    })
  }
})

// Handle members asking to join the group
projections.addHandler(25, (e: Event) => {
  const recipient = Tags.from(e.wrap).type("p").values().first()
  const adminKey = groupAdminKeys.key(recipient)

  if (!adminKey.exists()) {
    return
  }

  handleGroupRequest(adminKey.get().group, e)
})

// Optimistically remove members who request leaving the group
projections.addHandler(26, (e: Event) => {
  const pubkeys = Tags.from(e).type("p").values().all()
  const recipient = Tags.from(e.wrap).type("p").values().first()
  const sharedKey = groupSharedKeys.key(recipient)

  if (!sharedKey.exists()) {
    return
  }

  const {group} = sharedKey.get()

  handleGroupRequest(group, e)

  // If the user is removing himself, delete group events
  if (pubkeys.includes(e.pubkey)) {
    sharedKey.update(updateIn("members", without([e.pubkey])))

    if (sessions.get()[e.pubkey]) {
      _events.update(reject(whereEq({group})))
    }
  }
})

// Members added notification
projections.addHandler(27, (e: Event) => {
  groupSharedKeys
    .key(e.wrap.pubkey)
    .update(
      updateIn("members", (m: string[]) => uniq(m.concat(Tags.from(e).type("p").values().all())))
    )
})

// Members removed notification
projections.addHandler(28, (e: Event) => {
  groupSharedKeys
    .key(e.wrap.pubkey)
    .update(
      updateIn("members", (m: string[]) => uniq(without(Tags.from(e).type("p").values().all(), m)))
    )
})

// All other events are messages sent to the group
projections.addGlobalHandler((e: Event) => {
  if (!e.wrap) {
    return
  }

  const sharedKey = groupSharedKeys.key(e.wrap.pubkey)

  if (sharedKey.exists()) {
    const {group} = sharedKey.get()

    if (group !== e.pubkey) {
      sharedKey.update(updateIn("members", (m: string[]) => uniq(m.concat(e.pubkey))))
    }

    _events.key(e.id).set({...e, group})
  }
})

// Unwrap gift wraps using our group keys
projections.addHandler(EventKind.GiftWrap, wrap => {
  const key = getRecipientKey(wrap)

  if (key) {
    nip59.get().withUnwrappedEvent(wrap, key, rumor => projections.push(rumor))
  }
})
