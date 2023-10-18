<script lang="ts">
  import {defaultTo} from "ramda"
  import ImageCircle from "src/partials/ImageCircle.svelte"
  import PlaceholderCircle from "src/app/shared/PlaceholderCircle.svelte"
  import {groups} from "src/engine"

  export let groupPubkey

  const group = groups.key(groupPubkey).derived(defaultTo({pubkey: groupPubkey}))
</script>

{#if $group.meta?.picture}
  <ImageCircle src={$group.meta?.picture} class={$$props.class} />
{:else}
  <PlaceholderCircle pubkey={groupPubkey} class={$$props.class} />
{/if}
