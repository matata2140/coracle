import {collection} from "src/engine/core/utils"
import type {Group, GroupAdminKey, GroupSharedKey, GroupRequest} from "./model"

export const groups = collection<Group>("pubkey")
export const groupAdminKeys = collection<GroupAdminKey>("pubkey")
export const groupSharedKeys = collection<GroupSharedKey>("pubkey")
export const groupRequests = collection<GroupRequest>("id")
