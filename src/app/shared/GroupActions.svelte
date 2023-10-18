<script lang="ts">
  import Popover from "src/partials/Popover.svelte"
  import OverflowMenu from "src/partials/OverflowMenu.svelte"
  import {router} from "src/app/router"
  import {
    groups,
    publishGroupEntryRequest,
    publishGroupExitRequest,
    deriveSharedKeyForGroup,
    groupAdminKeys,
    getGroupNaddr,
    canSign,
  } from "src/engine"

  export let groupPubkey

  const group = groups.key(groupPubkey)
  const adminKey = groupAdminKeys.key(groupPubkey)
  const sharedKey = deriveSharedKeyForGroup(groupPubkey)

  let actions = []

  $: joined = $sharedKey && !$group.exit_requested

  $: {
    actions = []

    actions.push({
      onClick: () => router.at("qrcode").of(getGroupNaddr($group)).open(),
      label: "Share",
      icon: "share-nodes",
    })

    if ($adminKey) {
      actions.push({
        onClick: () => router.at("groups").of(groupPubkey).at("edit").open(),
        label: "Edit",
        icon: "edit",
      })

      actions.push({
        onClick: () => router.at("groups").of(groupPubkey).at("rotate").open(),
        label: "Rotate Keys",
        icon: "rotate",
      })

      actions.push({
        onClick: () => router.at("groups").of(groupPubkey).at("info").open(),
        label: "Details",
        icon: "info",
      })
    }
  }

  const leave = () => publishGroupExitRequest(groupPubkey)

  const join = () => publishGroupEntryRequest(groupPubkey)
</script>

<div class="flex items-center gap-3" on:click|stopPropagation>
  {#if $canSign && !$adminKey}
    {#if $group.access_requested}
      <Popover triggerType="mouseenter">
        <div slot="trigger" class="w-6 text-center">
          <i class="fa fa-hourglass cursor-pointer" />
        </div>
        <div slot="tooltip">Access Pending</div>
      </Popover>
    {:else if joined}
      <Popover triggerType="mouseenter">
        <div slot="trigger" class="w-6 text-center">
          <i class="fa fa-right-from-bracket cursor-pointer" on:click={leave} />
        </div>
        <div slot="tooltip">Leave</div>
      </Popover>
    {:else}
      <Popover triggerType="mouseenter">
        <div slot="trigger" class="w-6 text-center">
          <i class="fa fa-right-to-bracket cursor-pointer" on:click={join} />
        </div>
        <div slot="tooltip">Join</div>
      </Popover>
    {/if}
  {/if}
  <OverflowMenu {actions} />
</div>
