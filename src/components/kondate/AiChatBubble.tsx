"use client";

type Props = {
  role: "user" | "assistant";
  children: React.ReactNode;
};

export default function AiChatBubble({ role, children }: Props) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent/20 px-3.5 py-2.5 text-sm">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2 rounded-2xl rounded-bl-md bg-card px-3.5 py-2.5 text-sm">
        {children}
      </div>
    </div>
  );
}
