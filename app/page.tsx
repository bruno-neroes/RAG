import questions from "@/eval/questions.json";
import Chat from "@/components/Chat";
import { STARTER_QUESTIONS } from "@/lib/prompt";

// Componente de servidor: só as perguntas sugeridas chegam ao browser (as adversariais não).
export default function Page() {
  const suggestions = questions.suggested.map((s) => s.q);
  return <Chat suggestions={suggestions} starters={STARTER_QUESTIONS} />;
}
