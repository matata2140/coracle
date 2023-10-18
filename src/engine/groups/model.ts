import type {Event} from "src/engine/events/model"

export type GroupMeta = {
  name?: string
  about?: string
  banner?: string
  picture?: string
}

export type Group = {
  pubkey: string
  published_at?: number
  relays?: string[]
  relays_updated_at?: string[]
  meta?: GroupMeta
  meta_updated_at?: number
  moderators?: string[]
  moderators_updated_at?: number
  access_requested?: number
  exit_requested?: number
}

export type GroupRequest = Event & {
  group: string
  resolved: boolean
}

export type GroupAdminKey = {
  group: string
  pubkey: string
  privkey: string
}

export type GroupSharedKey = {
  group: string
  pubkey: string
  privkey: string
  members: string[]
  created_at: number
}
