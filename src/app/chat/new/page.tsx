import { AgentChat } from "@/components/agent-chat";
import { getAuthUser } from "@/lib/supabase/auth-server";

export default async function NewChatPage() {
  const user = await getAuthUser();
  return <AgentChat key="new" userEmail={user?.email} />;
}
