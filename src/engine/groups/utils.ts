import {nip19} from "nostr-tools"
import {pluck, prop, sortBy, last, whereEq} from "ramda"
import {ellipsize} from "hurdak"
import {Tags} from "src/util/nostr"
import {derived} from "src/engine/core/utils"
import {session} from "src/engine/session/derived"
import type {GroupSharedKey, Group} from "./model"
import {groupSharedKeys, groupAdminKeys} from "./state"

export const getGroupFromSharedKey = pubkey => groupSharedKeys.key(pubkey).get().group

export const getGroupNaddr = ({pubkey, relays}: Group) =>
  nip19.naddrEncode({kind: 100024, identifier: "", pubkey, relays})

export const displayGroup = ({meta, pubkey, relays = []}: Group) => {
  if (meta?.name) {
    return ellipsize(meta.name, 60)
  }

  try {
    return getGroupNaddr({pubkey, relays}).slice(-8)
  } catch (e) {
    console.error(e)

    return ""
  }
}

export const getRecipientKey = wrap => {
  const pubkey = Tags.from(wrap).getMeta("p")
  const key = groupSharedKeys.key(pubkey).get() || groupAdminKeys.key(pubkey).get()

  return key?.privkey
}

export const deriveSharedKeyForGroup = (groupPubkey: string) => {
  return groupSharedKeys.derived<GroupSharedKey>($keys => {
    return last(sortBy(prop("created_at"), $keys.filter(whereEq({group: groupPubkey}))))
  })
}

export const deriveWrapperRecipients = (groupPubkey = null) => {
  return derived(
    [session, groupSharedKeys, groupAdminKeys],
    ([$session, $groupSharedKeys, $groupAdminKeys]) => {
      if (groupPubkey) {
        $groupSharedKeys = $groupSharedKeys.filter(whereEq({group: groupPubkey}))
        $groupAdminKeys = $groupAdminKeys.filter(whereEq({group: groupPubkey}))
      }

      return pluck("pubkey", [$session, ...$groupSharedKeys, ...$groupAdminKeys])
    }
  )
}
