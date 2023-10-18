<script lang="ts">
  import {toast} from "src/partials/state"
  import GroupDetailsForm from "src/app/shared/GroupDetailsForm.svelte"
  import {groups, publishGroupMeta} from "src/engine"
  import {router} from "src/app/router"

  export let groupPubkey

  const group = groups.key(groupPubkey)

  const onSubmit = async ({meta, relays, published_at}) => {
    publishGroupMeta(groupPubkey, meta, relays, {
      shouldWrap: !published_at,
    })

    toast.show("info", "Your group has been updated!")
    router.pop()
  }
</script>

<GroupDetailsForm
  {onSubmit}
  mode="edit"
  meta={$group.meta || {}}
  relays={$group.relays || []}
  published_at={$group.published_at} />
