<script lang="ts">
  import Card from "src/partials/Card.svelte"
  import Anchor from "src/partials/Anchor.svelte"
  import PersonSummary from "src/app/shared/PersonSummary.svelte"
  import {session, groupAdminKeys} from "src/engine"
  import {router} from "src/app/router"

  export let groupPubkey
  export let pubkey

  const adminKey = groupAdminKeys.key(groupPubkey)

  const remove = () =>
    router
      .at("group")
      .of(groupPubkey)
      .at("rotate")
      .qp({removeMembers: [pubkey]})
      .open()

  const openPerson = pubkey => router.at("people").of(pubkey).open()
</script>

<Card interactive on:click={() => openPerson(pubkey)}>
  <PersonSummary inert {pubkey}>
    <div slot="actions" on:click|stopPropagation>
      {#if $adminKey && pubkey !== $session.pubkey}
        <Anchor href={remove} theme="button-accent">Remove</Anchor>
      {/if}
    </div>
  </PersonSummary>
</Card>
