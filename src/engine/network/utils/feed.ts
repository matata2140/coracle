import {
  reject,
  partition,
  find,
  propEq,
  uniqBy,
  identity,
  pluck,
  sortBy,
  without,
  any,
  prop,
  assoc,
} from "ramda"
import {ensurePlural, doPipe, batch} from "hurdak"
import {now, race, pushToKey} from "src/util/misc"
import {findReplyId, noteKinds, reactionKinds, LOCAL_RELAY_URL} from "src/util/nostr"
import type {DisplayEvent} from "src/engine/notes/model"
import type {Event} from "src/engine/events/model"
import {isEventMuted} from "src/engine/events/derived"
import {writable} from "src/engine/core/utils"
import type {Filter} from "../model"
import {getIdFilters, guessFilterDelta} from "./filters"
import {getUrls} from "./executor"
import {subscribe} from "./subscribe"
import {MultiCursor} from "./cursor"
import {load} from "./load"

export type FeedOpts = {
  relays: string[]
  filters: Filter[]
  onEvent?: (e: Event) => void
  shouldDefer?: boolean
  shouldListen?: boolean
  shouldHideReplies?: boolean
  shouldLoadParents?: boolean
}

export class FeedLoader {
  since = now()
  stopped = false
  subs: Array<{close: () => void}> = []
  buffer = writable<Event[]>([])
  notes = writable<DisplayEvent[]>([])
  parents = new Map<string, DisplayEvent>()
  deferred: Event[] = []
  cursor: MultiCursor
  ready: Promise<void>
  isEventMuted = isEventMuted.get()

  constructor(readonly opts: FeedOpts) {
    const urls = getUrls(opts.relays)

    // No point in subscribing if we have an end date
    if (opts.shouldListen && !any(prop("until"), ensurePlural(opts.filters) as any[])) {
      this.addSubs([
        subscribe({
          relays: urls,
          filters: opts.filters.map(assoc("since", this.since)),
          onEvent: batch(1000, (events: Event[]) => {
            events = this.discardEvents(events)

            if (opts.shouldLoadParents) {
              this.loadParents(events)
            }

            this.buffer.update($buffer => $buffer.concat(events))
          }),
        }),
      ])
    }

    this.cursor = new MultiCursor({
      relays: opts.relays,
      filters: opts.filters,
      onEvent: batch(100, events => {
        if (opts.shouldLoadParents) {
          this.loadParents(this.discardEvents(events))
        }
      }),
    })

    const subs = this.cursor.load(50)

    this.addSubs(subs)

    // Wait until a good number of subscriptions have completed to reduce the chance of
    // out of order notes
    this.ready = race(0.2, pluck("result", subs))
  }

  discardEvents(events) {
    return events.filter(e => {
      if (this.isEventMuted(e)) {
        return false
      }

      if (this.opts.shouldHideReplies && findReplyId(e)) {
        return false
      }

      return true
    })
  }

  loadParents = notes => {
    const parentIds = reject(this.isEventMuted, notes).map(findReplyId).filter(identity)

    load({
      relays: this.opts.relays.concat(LOCAL_RELAY_URL),
      filters: getIdFilters(parentIds),
      onEvent: batch(100, events => {
        for (const e of this.discardEvents(events)) {
          this.parents.set(e.id, e)
        }
      }),
    })
  }

  // Control

  addSubs(subs) {
    for (const sub of ensurePlural(subs)) {
      this.subs.push(sub)

      sub.on("close", () => {
        this.subs = without([sub], this.subs)
      })
    }
  }

  stop() {
    this.stopped = true

    for (const sub of this.subs) {
      sub.close()
    }
  }

  // Feed building

  buildFeedChunk = (notes: Event[]) => {
    const seen = new Set(pluck("id", this.notes.get()))
    const parents = []

    return sortBy(
      (e: DisplayEvent) => -e.created_at,
      uniqBy(
        prop("id"),
        notes
          // If we have a parent, show that instead, with replies grouped underneath
          .map(e => {
            /* eslint no-constant-condition: 0 */
            while (true) {
              const parentId = findReplyId(e)

              if (!parentId) {
                break
              }

              const parent = this.parents.get(parentId)

              if (!parent) {
                break
              }

              if (noteKinds.includes(e.kind) && !find(propEq("id", e.id), parent.replies || [])) {
                pushToKey(parent as any, "replies", e)
              }

              e = parent
            }

            return e
          })
          .concat(parents)
          // If we've seen this note or its parent, don't add it again
          .filter(e => {
            if (seen.has(e.id)) return false
            if (reactionKinds.includes(e.kind)) return false

            return true
          })
          .map((e: DisplayEvent) => {
            if (e.replies) {
              e.replies = uniqBy(prop("id"), e.replies)
            }

            return e
          })
      )
    )
  }

  addToFeed = (notes: Event[]) => {
    this.notes.update($notes => uniqBy(prop("id"), $notes.concat(this.buildFeedChunk(notes))))
  }

  subscribe = f => this.notes.subscribe(f)

  // Loading

  async load(n) {
    await this.ready

    const [subs, events] = this.cursor.take(n)
    const notes = this.discardEvents(events)

    this.addSubs(subs)

    if (this.opts.shouldDefer) {
      const deferred = this.deferred.splice(0)

      this.addToFeed(doPipe(notes.concat(deferred), [this.deferOrphans, this.deferAncient]))
    } else {
      this.addToFeed(notes)
    }
  }

  loadBuffer() {
    this.buffer.update($buffer => {
      this.addToFeed($buffer)

      return []
    })
  }

  deferOrphans = (notes: Event[]) => {
    if (!this.opts.shouldLoadParents) {
      return notes
    }

    // If something has a parent id but we haven't found the parent yet, skip it until we have it.
    const [defer, ok] = partition(e => {
      const parentId = findReplyId(e)

      return parentId && !this.parents.get(parentId)
    }, notes)

    setTimeout(() => this.addToFeed(defer), 1500)

    return ok
  }

  deferAncient = (notes: Event[]) => {
    // Sometimes relays send very old data very quickly. Pop these off the queue and re-add
    // them after we have more timely data. They still might be relevant, but order will still
    // be maintained since everything before the cutoff will be deferred the same way.
    const since = now() - guessFilterDelta(this.opts.filters)
    const [defer, ok] = partition(e => e.created_at < since, notes)

    setTimeout(() => this.addToFeed(defer), 4000)

    return ok
  }
}
