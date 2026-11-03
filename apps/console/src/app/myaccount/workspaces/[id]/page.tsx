import WorkspaceMembersClient from "./workspace-members-client";

export default async function Page({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } =
    await params;

  return (
    <WorkspaceMembersClient
      workspaceId={id}
    />
  );
}
