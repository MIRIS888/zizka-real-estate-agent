import { AgentChat } from "@/components/agent-chat";
import { getAuthUser } from "@/lib/supabase/auth-server";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const user = await getAuthUser();
  return <AgentChat key={threadId} initialThreadId={threadId} userEmail={user?.email} />;
}
