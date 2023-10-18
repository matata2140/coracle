<script lang="ts">
  import {pluralize} from "hurdak"
  import {Tags} from "src/util/nostr"
  import Card from "src/partials/Card.svelte"
  import Chip from "src/partials/Chip.svelte"
  import Anchor from "src/partials/Anchor.svelte"
  import Content from "src/partials/Content.svelte"
  import PersonBadgeSmall from "src/app/shared/PersonBadgeSmall.svelte"
  import {groupRequests} from "src/engine"
  import {router} from "src/app/router"

  export let groupPubkey
  export let request

  const pubkeys = Tags.from(request).type("p").values().all()

  const dismiss = () => groupRequests.key(request.id).merge({resolved: true})

  const resolve = () => {
    if (request.kind === 25) {
      router.at("groups").of(groupPubkey).at("rotate").qp({addMembers: pubkeys}).open()
    }

    if (request.kind === 26) {
      router.at("groups").of(groupPubkey).at("rotate").qp({removeMembers: pubkeys}).open()
    }
  }
</script>

<Card interactive>
  <Content>
    <div class="flex items-center justify-between">
      <p class="text-xl">
        {#if request.kind === 25}
          Request to join
        {:else if request.kind === 26}
          Key rotation request
        {/if}
      </p>
      <div class="hidden gap-2 sm:flex">
        <Anchor on:click={dismiss} theme="button">Dismiss</Anchor>
        <Anchor on:click={resolve} theme="button-accent">Resolve</Anchor>
      </div>
    </div>
    <p class="border-l-2 border-solid border-gray-5 pl-2">
      "{request.content}"
    </p>
    <i>
      Applying this request would
      {#if request.kind === 25}
        add the following {pluralize(pubkeys.length, "person", "people")} to the group:
      {:else if request.kind === 26}
        remove the following {pluralize(pubkeys.length, "person", "people")} from the group:
      {/if}
    </i>
    <p>
      {#each pubkeys as pubkey}
        <Chip class="mb-2 mr-2 inline-block">
          <PersonBadgeSmall {pubkey} />
        </Chip>
      {/each}
    </p>
    <div class="flex gap-2 sm:hidden">
      <Anchor on:click={dismiss} theme="button">Dismiss</Anchor>
      <Anchor on:click={resolve} theme="button-accent">Resolve</Anchor>
    </div>
  </Content>
</Card>
