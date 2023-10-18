import {asNostrEvent} from "src/util/nostr"
import {getPublishHints, getUserRelayUrls} from "src/engine/relays/utils"
import {Publisher, buildEvent, publishEvent, getReplyTags} from "src/engine/network/utils"

export const publishNote = (content, tags = [], relays = null) =>
  publishEvent(1, {content, tags, relays})

export const publishReply = (parent, content, tags = []) => {
  const relays = getPublishHints(parent)

  // Re-broadcast the note we're replying to
  Publisher.publish({relays, event: asNostrEvent(parent)})

  return publishEvent(1, {relays, content, tags: [...tags, ...getReplyTags(parent, true)]})
}

export const publishDeletion = (ids, relays = null) =>
  publishEvent(5, {
    relays: relays || getUserRelayUrls("write"),
    tags: ids.map(id => [id.includes(":") ? "a" : "e", id]),
  })

export const buildReaction = (parent, content = "", tags = []) =>
  buildEvent(7, {content, tags: [...tags, ...getReplyTags(parent)]})
