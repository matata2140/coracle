<script lang="ts">
  import {pluck} from "ramda"
  import GroupDetailsForm from "src/app/shared/GroupDetailsForm.svelte"
  import {publishGroupMeta, publishGroupInvites, initGroup, user} from "src/engine"
  import {router} from "src/app/router"

  const onSubmit = async ({meta, relays, members, published_at}) => {
    const groupId = initGroup()

    const invitePubs = await publishGroupInvites(
      groupId,
      members.map(p => p.pubkey),
      relays
    )

    const metaPub = await publishGroupMeta(groupId, meta, relays, {shouldWrap: !published_at})

    await Promise.all(pluck("result", invitePubs.concat(metaPub)))

    router.at("groups").of(groupId).at("members").replace()
  }
</script>

<GroupDetailsForm {onSubmit} showMembers members={[$user]} />
