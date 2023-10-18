import {mergeHints, getUserRelayUrls, getGroupHints} from "src/engine/relays/utils"
import {load, subscribe} from "src/engine/network/utils"
import {groups} from "./state"
import {deriveWrapperRecipients} from "./utils"

export const loadGroups = () => {
  const recipients = deriveWrapperRecipients().get()

  load({
    relays: mergeHints(groups.get().map($group => getGroupHints($group.pubkey))),
    filters: [{kinds: [1059], "#p": recipients, limit: 1000}],
  })

  load({
    relays: getUserRelayUrls("read"),
    filters: [{kinds: [10024], limit: 100}],
  })
}

export const listenForGroupNotes = pubkey => {
  const recipients = deriveWrapperRecipients(pubkey).get()

  return subscribe({
    relays: getGroupHints(pubkey),
    filters: [{authors: [pubkey]}, {kinds: [1059], "#p": recipients}],
  })
}
