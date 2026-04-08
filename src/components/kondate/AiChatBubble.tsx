"use client";

type Props = {
  role: "user" | "assistant";
  children: React.ReactNode;
};

export default function AiChatBubble({ role, children }: Props) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-[18px] rounded-br-[4px] bg-blue px-3.5 py-2 text-[15px] text-white">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2 rounded-[18px] rounded-bl-[4px] bg-bg-tertiary px-3.5 py-2 text-[15px] text-label">
        {children}
      </div>
    </div>
  );
}
