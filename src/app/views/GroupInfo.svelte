<script lang="ts">
  import Content from "src/partials/Content.svelte"
  import Popover from "src/partials/Popover.svelte"
  import CopyValue from "src/partials/CopyValue.svelte"
  import {groups, groupAdminKeys, getGroupNaddr} from "src/engine"

  export let groupPubkey

  const group = groups.key(groupPubkey)
  const adminKey = groupAdminKeys.key(groupPubkey)
</script>

<Content>
  <h1 class="staatliches text-2xl">Details</h1>
  <CopyValue label="Link" value={getGroupNaddr($group)} />
  {#if $adminKey}
    <CopyValue isPassword value={$adminKey.privkey}>
      <div slot="label" class="flex gap-2">
        <span>Admin Key</span>
        <Popover triggerType="mouseenter">
          <i slot="trigger" class="fa fa-info-circle cursor-pointer" />
          <span slot="tooltip">This is your group administration password. Keep it secret!</span>
        </Popover>
      </div>
    </CopyValue>
  {/if}
</Content>
