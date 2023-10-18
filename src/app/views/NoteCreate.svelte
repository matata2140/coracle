<script lang="ts">
  import {onMount} from "svelte"
  import {nip19} from "nostr-tools"
  import {without, uniqBy, prop} from "ramda"
  import {throttle} from "hurdak"
  import {writable} from "svelte/store"
  import {annotateMedia} from "src/util/misc"
  import {asNostrEvent} from "src/util/nostr"
  import Anchor from "src/partials/Anchor.svelte"
  import Card from "src/partials/Card.svelte"
  import Compose from "src/app/shared/Compose.svelte"
  import ImageInput from "src/partials/ImageInput.svelte"
  import Media from "src/partials/Media.svelte"
  import Content from "src/partials/Content.svelte"
  import Modal from "src/partials/Modal.svelte"
  import Input from "src/partials/Input.svelte"
  import Field from "src/partials/Field.svelte"
  import Heading from "src/partials/Heading.svelte"
  import RelayCard from "src/app/shared/RelayCard.svelte"
  import GroupSummary from "src/app/shared/GroupSummary.svelte"
  import NoteContent from "src/app/shared/NoteContent.svelte"
  import RelaySearch from "src/app/shared/RelaySearch.svelte"
  import {Publisher, buildEvent, displayRelay, getUserRelayUrls, mention} from "src/engine"
  import {toastProgress} from "src/app/state"
  import {router} from "src/app/router"
  import {
    env,
    session,
    getEventHints,
    displayGroup,
    groups,
    groupSharedKeys,
    wrapOrSign,
  } from "src/engine"

  export let quote = null
  export let pubkey = null
  export let writeTo: string[] | null = null
  export let groupPubkey: string | null = quote?.group

  let q = ""
  let view = null
  let groupPk = groupPubkey
  let images = []
  let warning = null
  let compose = null
  let wordCount = 0
  let showPreview = false
  let relays = writable(writeTo ? writeTo : getUserRelayUrls("write"))

  const groupOptions = groupSharedKeys.derived($keys => {
    const $groups = []

    for (const k of $keys) {
      const group = groups.key(k.group).get()

      if (group) {
        $groups.push(group)
      }
    }

    return uniqBy(prop("id"), $groups)
  })

  const onSubmit = async () => {
    const tags = []
    const content = compose.parse().trim()

    if (!content) {
      return
    }

    if (warning) {
      tags.push(["content-warning", warning])
    }

    if (quote) {
      tags.push(mention(quote.pubkey))

      // Re-broadcast the note we're quoting
      if (!groupPk) {
        Publisher.publish({
          relays: $relays,
          event: asNostrEvent(quote),
        })
      }
    }

    const pub = Publisher.publish({
      relays: $relays,
      event: await wrapOrSign(groupPubkey, buildEvent(1, {content, tags})),
    })

    pub.on("progress", toastProgress)

    router.clearModals()
  }

  const addImage = url => {
    images = images.concat(url)
    compose.write("\n" + url)
  }

  const removeImage = url => {
    const content = compose.parse()

    compose.clear()
    compose.write(content.replace(url, ""))

    images = without([url], images)
  }

  const saveRelay = url => {
    q = ""
    relays.update($r => $r.concat(url))
  }

  const removeRelay = url => {
    relays.update(without([url]))
  }

  const setGroup = pubkey => {
    if (groupPk === pubkey) {
      groupPk = null
    } else {
      groupPk = pubkey
    }
  }

  const togglePreview = () => {
    showPreview = !showPreview
  }

  const setWordCount = throttle(300, () => {
    if (compose) {
      wordCount = compose.parse().match(/\s+/g)?.length || 0
    }
  })

  const showSettings = () => {
    view = "settings"
  }

  const showGroups = () => {
    view = "groups"
  }

  const hideView = () => {
    q = ""
    view = null
  }

  onMount(() => {
    if (pubkey && pubkey !== $session.pubkey) {
      compose.mention(pubkey)
    }

    if (quote) {
      const nevent = nip19.neventEncode({id: quote.id, relays: getEventHints(quote)})

      compose.nevent("nostr:" + nevent)
    }
  })
</script>

<form on:submit|preventDefault={onSubmit}>
  <Content size="lg">
    <Heading class="text-center">Create a note</Heading>
    <div class="flex w-full flex-col gap-4">
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <strong>What do you want to say?</strong>
          {#if $groupOptions.length > 0}
            <div class:cursor-pointer={!quote?.group} on:click={quote?.group ? null : showGroups}>
              <i class="fa fa-circle-nodes" />
              {#if groupPk}
                {displayGroup(groups.key(groupPk).get())}
              {/if}
            </div>
          {/if}
        </div>
        <div
          class="mt-4 rounded-xl border border-solid border-gray-6 p-3"
          class:bg-input={!showPreview}
          class:text-black={!showPreview}
          class:bg-gray-7={showPreview}>
          {#if showPreview}
            <NoteContent note={{content: compose.parse(), tags: []}} />
          {/if}
          <div class:hidden={showPreview}>
            <Compose on:keyup={setWordCount} bind:this={compose} {onSubmit} />
          </div>
        </div>
        <div class="flex items-center justify-end gap-2 text-gray-5">
          <small class="hidden sm:block">
            {wordCount} words
          </small>
          <span>•</span>
          <small on:click={togglePreview} class="cursor-pointer underline">
            {showPreview ? "Hide" : "Show"} Preview
          </small>
        </div>
      </div>
      {#if images.length > 0}
        <div class="columns-2 gap-2 lg:columns-3">
          {#each images as url}
            <div class="mb-2">
              <Media link={annotateMedia(url)} onClose={() => removeImage(url)} />
            </div>
          {/each}
        </div>
      {/if}
      <div class="flex gap-2">
        <Anchor tag="button" theme="button" type="submit" class="flex-grow text-center"
          >Send</Anchor>
        <ImageInput multi onChange={addImage} />
      </div>
      <small class="flex cursor-pointer items-center justify-end gap-2" on:click={showSettings}>
        <span>
          {#if $relays?.length === 1}
            {displayRelay({url: $relays[0]})}
          {:else}
            {$relays.length} relays
          {/if}
        </span>
        <span>•</span>
        <i class="fa fa-warning" />
        {warning || 0}
        <span>•</span>
        <i class="fa fa-edit" />
      </small>
    </div>
  </Content>
</form>

{#if view}
  <Modal onEscape={hideView}>
    <form on:submit|preventDefault={hideView}>
      <Content>
        {#if view === "settings"}
          <div class="mb-4 flex items-center justify-center">
            <Heading>Note settings</Heading>
          </div>
          <Field icon="fa-warning" label="Content warnings">
            <Input bind:value={warning} placeholder="Why might people want to skip this post?" />
          </Field>
          {#if $env.FORCE_RELAYS.length === 0}
            <Field icon="fa-database" label="Select which relays to publish to">
              <div>
                {#each $relays as url}
                  <div
                    class="mb-2 mr-1 inline-block rounded-full border border-solid border-gray-1 px-2 py-1">
                    <button
                      type="button"
                      class="fa fa-times cursor-pointer"
                      on:click={() => removeRelay(url)} />
                    {displayRelay({url})}
                  </div>
                {/each}
              </div>
              <RelaySearch bind:q limit={3} hideIfEmpty>
                <div slot="item" let:relay>
                  <RelayCard {relay}>
                    <button
                      slot="actions"
                      class="underline"
                      on:click|preventDefault={() => saveRelay(relay.url)}>
                      Add relay
                    </button>
                  </RelayCard>
                </div>
              </RelaySearch>
            </Field>
          {/if}
          <Anchor tag="button" theme="button" type="submit" class="w-full text-center">Done</Anchor>
        {:else if view === "groups"}
          <div class="mb-4 flex items-center justify-center">
            <Heading>Post to a group</Heading>
          </div>
          <div>Select a group to post to:</div>
          <div>
            {#each $groupOptions as group (group.pubkey)}
              <Card invertColors interactive on:click={() => setGroup(group.pubkey)}>
                <GroupSummary groupPubkey={group.pubkey}>
                  <div slot="actions">
                    {#if groupPk === group.pubkey}
                      <i class="fa fa-circle-check text-accent" />
                    {/if}
                  </div>
                </GroupSummary>
              </Card>
            {/each}
          </div>
          <Anchor tag="button" theme="button" type="submit" class="text-center">Done</Anchor>
        {/if}
      </Content>
    </form>
  </Modal>
{/if}
