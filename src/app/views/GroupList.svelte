<script>
  import {onMount} from "svelte"
  import {derived} from "svelte/store"
  import {partition, pluck} from "ramda"
  import Content from "src/partials/Content.svelte"
  import Anchor from "src/partials/Anchor.svelte"
  import GroupListItem from "src/app/views/GroupListItem.svelte"
  import {groups, groupSharedKeys, loadGroups} from "src/engine"

  const groupList = derived([groups, groupSharedKeys], ([$groups, $sharedKeys]) => {
    const groupIds = new Set(pluck("group", $sharedKeys))
    const [joined, other] = partition(g => g.access_requested || (groupIds.has(g.pubkey) && !g.exit_requested), $groups)

    return {joined, other}
  })

  onMount(loadGroups)

  document.title = "Groups"
</script>

<Content>
  <div class="flex justify-between">
    <div class="flex items-center gap-2">
      <i class="fa fa-circle-nodes fa-lg" />
      <h2 class="staatliches text-2xl">Your groups</h2>
    </div>
    <Anchor modal theme="button-accent" href="/groups/new">
      <i class="fa-solid fa-plus" /> Create Group
    </Anchor>
  </div>
  {#each $groupList.joined as group (group.pubkey)}
    <GroupListItem {group} />
  {:else}
    <p class="text-center py-8">You haven't yet joined any groups.</p>
  {/each}
  <div class="mb-2 border-b border-solid border-gray-6 pt-2" />
  {#each $groupList.other as group (group.pubkey)}
    <GroupListItem {group} />
  {/each}
</Content>
