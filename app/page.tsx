import questions from "@/eval/questions.json";
import questionsEn from "@/eval/questions.en.json";
import Chat from "@/components/Chat";
import { STARTER_QUESTIONS } from "@/lib/prompt";

// Componente de servidor: só as perguntas sugeridas chegam ao browser (as adversariais não).
export default function Page() {
  return (
    <Chat
      suggestions={{ pt: questions.suggested.map((s) => s.q), en: questionsEn.suggested.map((s) => s.q) }}
      starters={STARTER_QUESTIONS}
    />
  );
}
