import { JudgeWorkspace } from "@/components/JudgeWorkspace";
import { isJevConfigured } from "@/lib/jev";

export default function Home() {
  return <JudgeWorkspace jevConfigured={isJevConfigured()} />;
}
