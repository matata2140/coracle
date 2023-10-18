<script lang="ts">
  import {pluck, uniq, without} from "ramda"
  import {quantify, intersection, difference} from "hurdak"
  import {generatePrivateKey} from "nostr-tools"
  import {Tags} from "src/util/nostr"
  import {toast} from "src/partials/state"
  import Field from "src/partials/Field.svelte"
  import Input from "src/partials/Input.svelte"
  import Anchor from "src/partials/Anchor.svelte"
  import Content from "src/partials/Content.svelte"
  import Heading from "src/partials/Heading.svelte"
  import PersonMultiSelect from "src/app/shared/PersonMultiSelect.svelte"
  import {
    people,
    groups,
    groupRequests,
    publishGroupInvites,
    publishGroupMeta,
    deriveSharedKeyForGroup,
  } from "src/engine"
  import {router} from "src/app/router"

  export let groupPubkey
  export let addMembers = []
  export let removeMembers = []

  const group = groups.key(groupPubkey)
  const sharedKey = deriveSharedKeyForGroup(groupPubkey)
  const initialMembers = uniq(without(removeMembers, [...$sharedKey.members, ...addMembers]))

  const onSubmit = () => {
    const privkey = generatePrivateKey()
    const pubkeys = pluck("pubkey", members)

    // Clear any requests
    groupRequests.update($requests => {
      return $requests.map(r => {
        if (r.group !== groupPubkey) {
          return r
        }

        const targetPubkeys = new Set(Tags.from(r).type("p").values().all())

        if (r.kind === 25 && difference(targetPubkeys, new Set(pubkeys)).size === 0) {
          return {...r, resolved: true}
        }

        if (r.kind === 26 && intersection(targetPubkeys, new Set(pubkeys)).size === 0) {
          return {...r, resolved: true}
        }

        return r
      })
    })

    // Send new invites
    publishGroupInvites(groupPubkey, pubkeys, $group.relays, [
      ["privkey", String(privkey)],
      ["grace_period", String(graceHours * 60 * 60)],
    ])

    // Re-publish group info if not public
    const {meta, published_at} = group.get()

    if (!published_at) {
      publishGroupMeta(groupPubkey, meta, $group.relays, {
        shouldWrap: true,
      })
    }

    toast.show("info", "Invites have been sent!")
    router.pop()
  }

  let graceHours = 24
  let members = people.mapStore
    .derived(m => initialMembers.map(pubkey => m.get(pubkey) || {pubkey}))
    .get()
</script>

<form on:submit|preventDefault={onSubmit}>
  <Content size="lg">
    <Heading class="text-center">Rotate Keys</Heading>
    <p class="text-center">
      Rotate keys periodically to change group membership and increase security.
    </p>
    <Field label="Member List">
      <PersonMultiSelect bind:value={members} />
      <div slot="info">All members will receive a fresh invitation with a new key.</div>
    </Field>
    <Field label="Grace Period">
      <div slot="display">{quantify(graceHours, "hour")}</div>
      <Input type="range" bind:value={graceHours} min={0} max={72} />
      <div slot="info">Set how long the old key will still be valid for posting to the group.</div>
    </Field>
    <Anchor tag="button" theme="button" type="submit" class="text-center">Save</Anchor>
  </Content>
</form>
