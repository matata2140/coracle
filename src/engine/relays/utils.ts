import {nip19} from "nostr-tools"
import normalizeUrl from "normalize-url"
import {sortBy, pluck, uniq, nth, prop, last} from "ramda"
import {chain, displayList, first} from "hurdak"
import {fuzzy, stripProto} from "src/util/misc"
import {fromNostrURI, LOCAL_RELAY_URL, findReplyId, findRootId, Tags} from "src/util/nostr"
import type {Event} from "src/engine/events/model"
import {env} from "src/engine/session/state"
import {stateKey} from "src/engine/session/derived"
import {people} from "src/engine/people/state"
import {pool} from "src/engine/network/state"
import {getSetting} from "src/engine/session/utils"
import type {Relay} from "./model"
import {RelayMode} from "./model"

export const isShareableRelay = (url: string) =>
  // Is it actually a websocket url and has a dot
  url.match(/^wss?:\/\/.+\..+/) &&
  // Sometimes bugs cause multiple relays to get concatenated
  url.match(/:\/\//g).length === 1 &&
  // It shouldn't have any whitespace
  !url.match(/\s/) &&
  // It shouldn't have any url-encoded whitespace
  !url.match(/%/) &&
  // Is it secure
  url.match(/^wss:\/\/.+/) &&
  // Don't match stuff with a port number
  !url.slice(6).match(/:\d+/) &&
  // Don't match raw ip addresses
  !url.slice(6).match(/\d+\.\d+\.\d+\.\d+/) &&
  // Skip nostr.wine's virtual relays
  !url.slice(6).match(/\/npub/)

export const normalizeRelayUrl = (url: string) => {
  if (url === LOCAL_RELAY_URL) {
    return url
  }

  // Use our library to normalize
  url = normalizeUrl(url, {stripHash: true, stripAuthentication: false})

  // Strip the protocol since only wss works
  url = stripProto(url)

  // Urls without pathnames are supposed to have a trailing slash
  if (!url.includes("/")) {
    url += "/"
  }

  return "wss://" + url
}

export const urlToRelay = url => ({url: normalizeRelayUrl(url)} as Relay)

export const decodeRelay = entity => {
  entity = fromNostrURI(entity)

  try {
    return {url: nip19.decode(entity).data}
  } catch (e) {
    return {url: entity}
  }
}

export const relayIsLowQuality = (url: string) =>
  pool.get(url, {autoConnect: false})?.meta?.quality < 0.6

export const displayRelay = ({url}: Relay) => last(url.split("://")).replace(/\/$/, "")

export const displayRelays = (relays: Relay[], max = 3) =>
  displayList(relays.map(displayRelay), "and", max)

export const getRelaySearch = $relays => fuzzy($relays, {keys: ["url", "name", "description"]})

export const getSearchableRelays = ($relays: Relay[]) => {
  const urls = pluck(
    "url",
    $relays.filter(r => (r.info?.supported_nips || []).includes(50))
  )

  return uniq(env.get().SEARCH_RELAYS.concat(urls)).slice(0, 8) as string[]
}

export const getPubkeyRelays = (pubkey: string, mode: string = null) => {
  const relays = people.key(pubkey).get()?.relays || []

  return mode ? relays.filter(prop(mode)) : relays
}

export const getPubkeyRelayUrls = (pubkey: string, mode: string = null) =>
  pluck("url", getPubkeyRelays(pubkey, mode))

export const getUserRelays = (mode: string = null) => getPubkeyRelays(stateKey.get(), mode)

export const getUserRelayUrls = (mode: string = null) => pluck("url", getUserRelays(mode))

// Smart relay selection
//
// From Mike Dilger:
// 1) Other people's write relays — pull events from people you follow,
//    including their contact lists
// 2) Other people's read relays — push events that tag them (replies or just tagging).
//    However, these may be authenticated, use with caution
// 3) Your write relays —- write events you post to your microblog feed for the
//    world to see.  ALSO write your contact list.  ALSO read back your own contact list.
// 4) Your read relays —- read events that tag you.  ALSO both write and read
//    client-private data like client configuration events or anything that the world
//    doesn't need to see.
// 5) Advertise relays — write and read back your own relay list

export const selectHints = (hints: Iterable<string>, limit: number = null) => {
  const seen = new Set()
  const ok = []
  const bad = []

  if (!limit) {
    limit = getSetting("relay_limit")
  }

  for (const url of chain(hints, getUserRelayUrls(RelayMode.Read), env.get().DEFAULT_RELAYS)) {
    if (seen.has(url)) {
      continue
    }

    seen.add(url)

    // Skip relays that just shouldn't ever be published
    if (!isShareableRelay(url)) {
      continue
    }

    // Filter out relays that appear to be broken or slow
    if (relayIsLowQuality(url)) {
      bad.push(url)
    } else {
      ok.push(url)
    }

    if (ok.length > limit) {
      break
    }
  }

  // If we don't have enough hints, use the broken ones
  return ok.concat(bad).slice(0, limit)
}

export class HintSelector {
  constructor(readonly generateHints, readonly hintsLimit) {}

  limit = hintsLimit => new HintSelector(this.generateHints, hintsLimit)

  getHints = (...args) => selectHints(this.generateHints(...args), this.hintsLimit)
}

export const hintSelector = (generateHints: (...args: any[]) => Iterable<string>) => {
  const selector = new HintSelector(generateHints, getSetting("relay_limit"))
  const getHints = selector.getHints

  ;(getHints as any).limit = selector.limit

  return getHints as typeof getHints & {limit: typeof selector.limit}
}

export const getPubkeyHints = hintSelector(function* (pubkey: string, mode: RelayMode) {
  yield* getPubkeyRelayUrls(pubkey, mode)
})

export const getPubkeyHint = (pubkey: string) => first(getPubkeyHints(1, pubkey, "write")) || ""

export const getEventHints = hintSelector(function* (event: Event) {
  yield* getPubkeyRelayUrls(event.pubkey, RelayMode.Write)
  yield* event.seen_on.filter(isShareableRelay)
})

export const getEventHint = (event: Event) => first(getEventHints.limit(1).getHints(event)) || ""

// If we're looking for an event's children, the read relays the author has
// advertised would be the most reliable option, since well-behaved clients
// will write replies there.
export const getReplyHints = hintSelector(function* (event) {
  yield* getPubkeyRelayUrls(event.pubkey, RelayMode.Read)
})

// If we're looking for an event's parent, tags are the most reliable hint,
// but we can also look at where the author of the note reads from
export const getParentHints = hintSelector(function* (event) {
  const parentId = findReplyId(event)

  yield* Tags.from(event).equals(parentId).relays()
  yield* getPubkeyRelayUrls(event.pubkey, RelayMode.Read)
})

export const getRootHints = hintSelector(function* (event) {
  const rootId = findRootId(event)

  yield* Tags.from(event).equals(rootId).relays()
  yield* getPubkeyRelayUrls(event.pubkey, RelayMode.Read)
})

// If we're replying or reacting to an event, we want the author to know, as well as
// anyone else who is tagged in the original event or the reply. Get everyone's read
// relays. Limit how many per pubkey we publish to though. We also want to advertise
// our content to our followers, so publish to our write relays as well.
export const getPublishHints = hintSelector(function* (event: Event) {
  const pubkeys = Tags.from(event).type("p").values().all()
  const hintGroups = pubkeys.map(pubkey => getPubkeyRelayUrls(pubkey, RelayMode.Read))
  const authorRelays = getPubkeyRelayUrls(event.pubkey, RelayMode.Write)

  yield* mergeHints([...hintGroups, authorRelays, getUserRelayUrls(RelayMode.Write)])
})

export const getInboxHints = hintSelector(function* (pubkeys: string[]) {
  yield* mergeHints(pubkeys.map(pk => getPubkeyHints(pk, "read")))
})

export const mergeHints = (groups: string[][], limit: number = null) => {
  const scores = {} as Record<string, any>

  for (const hints of groups) {
    hints.forEach((hint, i) => {
      const score = 1 / (i + 1) / hints.length

      if (!scores[hint]) {
        scores[hint] = {score: 0, count: 0}
      }

      scores[hint].score += score
      scores[hint].count += 1
    })
  }

  // Use the log-sum-exp and a weighted sum
  for (const score of Object.values(scores)) {
    const weight = Math.log(groups.length / score.count)

    score.score = weight + Math.log1p(Math.exp(score.score - score.count))
  }

  return sortBy(([hint, {score}]) => score, Object.entries(scores))
    .map(nth(0))
    .slice(0, limit || getSetting("relay_limit"))
}
