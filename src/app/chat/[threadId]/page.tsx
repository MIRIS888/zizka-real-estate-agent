import { AgentChat } from "@/components/agent-chat";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  return <AgentChat initialThreadId={threadId} />;
}
