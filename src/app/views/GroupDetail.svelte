<script>
  import {onMount} from "svelte"
  import {defaultTo, filter, whereEq} from "ramda"
  import {getThemeBackgroundGradient} from "src/partials/state"
  import Content from "src/partials/Content.svelte"
  import Tabs from "src/partials/Tabs.svelte"
  import GroupCircle from "src/app/shared/GroupCircle.svelte"
  import GroupActions from "src/app/shared/GroupActions.svelte"
  import GroupAbout from "src/app/shared/GroupAbout.svelte"
  import GroupRequest from "src/app/shared/GroupRequest.svelte"
  import GroupMember from "src/app/shared/GroupMember.svelte"
  import Note from "src/app/shared/Note.svelte"
  import {
    displayGroup,
    groups,
    groupRequests,
    sortEventsDesc,
    deriveSharedKeyForGroup,
    listenForGroupNotes,
    groupAdminKeys,
    events,
  } from "src/engine"
  import {router} from "src/app/router"

  export let groupPubkey, activeTab

  const setActiveTab = tab => router.at("groups").of(groupPubkey).at(tab).push()

  const {rgb, rgba} = getThemeBackgroundGradient()
  const group = groups.key(groupPubkey).derived(defaultTo({pubkey: groupPubkey}))
  const requests = groupRequests.derived(filter(whereEq({group: groupPubkey, resolved: false})))
  const sharedKey = deriveSharedKeyForGroup(groupPubkey)
  const adminKey = groupAdminKeys.key(groupPubkey)

  $: tabs = $adminKey ? ["notes", "members", "admin"] : ["notes", "members"]

  const notes = events.derived($events => {
    const groupKinds = new Set([24, 25, 26, 27, 28, 10024, 10025])

    return sortEventsDesc(
      $events.filter($e => $e.group === groupPubkey && !groupKinds.has($e.kind))
    )
  })

  onMount(() => {
    const sub = listenForGroupNotes(groupPubkey)

    return () => sub.close()
  })

  document.title = $group.name || "Group Detail"
</script>

<div
  class="absolute left-0 h-64 w-full"
  style={`z-index: -1;
         background-size: cover;
         background-image: linear-gradient(to bottom, ${rgba}, ${rgb}), url('${$group.meta?.banner}')`} />

<Content>
  <div class="flex gap-4 text-gray-1">
    <GroupCircle {groupPubkey} size={12} class="mt-1 sm:h-32 sm:w-32" />
    <div class="flex min-w-0 flex-grow flex-col gap-4">
      <div class="flex items-center justify-between gap-4">
        <span class="text-2xl">{displayGroup($group)}</span>
        <div class="hidden xs:block">
          <GroupActions {groupPubkey} />
        </div>
      </div>
      <GroupAbout {groupPubkey} />
    </div>
  </div>

  <Tabs {tabs} {activeTab} {setActiveTab} />

  {#if activeTab === "notes"}
    {#each $notes as note (note.id)}
      <Note depth={2} {note} />
    {:else}
      <p class="text-center py-8">No notes found.</p>
    {/each}
  {:else if activeTab === "members"}
    {#each $sharedKey?.members || [] as pubkey (pubkey)}
      <GroupMember {groupPubkey} {pubkey} />
    {:else}
      <p class="text-center py-12">No members found.</p>
    {/each}
  {:else if activeTab === "admin"}
    {#each $requests as request (request.id)}
      <GroupRequest {groupPubkey} {request} />
    {:else}
      <p class="text-center py-12">No action items found.</p>
    {/each}
  {/if}
</Content>
