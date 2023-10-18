<script lang="ts">
  import {defaultTo} from "ramda"
  import GroupCircle from "src/app/shared/GroupCircle.svelte"
  import GroupAbout from "src/app/shared/GroupAbout.svelte"
  import {groups, displayGroup} from "src/engine"

  export let groupPubkey

  const group = groups.key(groupPubkey).derived(defaultTo({pubkey: groupPubkey}))
</script>

<div class="flex gap-4 text-gray-1">
  <GroupCircle {groupPubkey} size={8} />
  <div class="flex min-w-0 flex-grow flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <span class="text-2xl">{displayGroup($group)}</span>
      <slot name="actions" class="hidden xs:block" />
    </div>
    <GroupAbout {groupPubkey} />
  </div>
</div>
