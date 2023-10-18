import {generatePrivateKey, getPublicKey} from "nostr-tools"
import {now} from "src/util/misc"
import {buildEvent, Publisher, mention} from "src/engine/network/utils"
import {nip59, signer, session} from "src/engine/session/derived"
import {displayPubkey} from "src/engine/people/utils"
import {groups, groupAdminKeys, groupSharedKeys} from "./state"
import {deriveSharedKeyForGroup} from "./utils"

export const initGroup = () => {
  const adminSk = generatePrivateKey()
  const adminPk = getPublicKey(adminSk)
  const sharedSk = generatePrivateKey()
  const sharedPk = getPublicKey(sharedSk)

  groupAdminKeys.key(adminPk).set({
    group: adminPk,
    pubkey: adminPk,
    privkey: adminSk,
  })

  groupSharedKeys.key(sharedPk).set({
    group: adminPk,
    pubkey: sharedPk,
    privkey: sharedSk,
    created_at: now(),
    members: [],
  })

  return adminPk
}

export const wrapForGroup = async (groupPubkey, template) => {
  const $sharedKey = deriveSharedKeyForGroup(groupPubkey).get()

  return await nip59.get().wrap(template, {
    wrap: {
      author: $sharedKey.privkey,
      recipient: $sharedKey.pubkey,
    },
  })
}

export const wrapOrSign = (groupPubkey, template) =>
  groupPubkey ? wrapForGroup(groupPubkey, template) : signer.get().signAsUser(template)

export const publishGroupInvites = async (group, pubkeys, relays, tags = []) => {
  const adminKey = groupAdminKeys.key(group).get()
  const sharedKey = deriveSharedKeyForGroup(group).get()

  const template = buildEvent(24, {
    tags: [["privkey", sharedKey.privkey], ...pubkeys.map(mention), ...tags],
  })

  return await Promise.all(
    pubkeys.map(async pubkey => {
      const event = await nip59.get().wrap(template, {
        author: adminKey.privkey,
        wrap: {
          author: generatePrivateKey(),
          recipient: pubkey,
        },
      })

      return Publisher.publish({event, relays})
    })
  )
}

export const publishGroupMeta = async (group, meta, relays, {shouldWrap}) => {
  const adminKey = groupAdminKeys.key(group).get()

  const template = buildEvent(10024, {
    content: JSON.stringify(meta),
    tags: relays.map(url => ["r", url]),
  })

  const event = shouldWrap
    ? await wrapForGroup(group, template)
    : await signer.get().signWithKey(template, adminKey.privkey)

  return Publisher.publish({event, relays})
}

export const publishGroupExitRequest = async groupPubkey => {
  const $group = groups.key(groupPubkey).get()
  const $session = session.get()

  groups.key(groupPubkey).merge({
    exit_requested: now(),
    access_requested: null,
  })

  const template = buildEvent(26, {
    content: `${displayPubkey($session.pubkey)} is leaving the group`,
    tags: [mention($session.pubkey)],
  })

  Publisher.publish({
    event: await wrapForGroup(groupPubkey, template),
    relays: $group.relays,
  })
}

export const publishGroupEntryRequest = async groupPubkey => {
  const $group = groups.key(groupPubkey).get()
  const $session = session.get()

  groups.key(groupPubkey).merge({
    access_requested: now(),
    exit_requested: null,
  })

  const template = buildEvent(25, {
    content: `${displayPubkey($session.pubkey)} would like to join the group`,
    tags: [mention($session.pubkey)],
  })

  const event = await nip59.get().wrap(template, {
    wrap: {
      author: generatePrivateKey(),
      recipient: groupPubkey,
    },
  })

  Publisher.publish({event, relays: $group.relays})
}
