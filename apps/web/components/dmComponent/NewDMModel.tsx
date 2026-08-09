"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "../../app/lib/api";
import { getErrorMessage } from "../../app/lib/errors";
import UserSearch, { User } from "../search/UserSearch";

export default function NewDMModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  const handleStartDM = async (user: User) => {
    try {
      const res = await api.post(`/dm/start-dm/${user.id}`);
      const directChatId = res.data.chat.id;
      onClose();
      router.push(`/dashboard/dm/${directChatId}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to start DM"));
    }
  };

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="
        fixed inset-0 z-50 flex items-center justify-center
        bg-black/65 backdrop-blur-sm
        animate-[fadeIn_0.2s_ease_both]
      "
    >
      <div
        className="
          relative w-105 bg-surface rounded-[20px] p-7 overflow-hidden
          border border-white/9
          shadow-[0_24px_64px_rgba(0,0,0,0.6),0_0_0_1px_rgba(108,99,255,0.08)]
          animate-[modalSpring_0.25s_cubic-bezier(0.34,1.56,0.64,1)_both]
        "
      >
        {/* Glow blob */}
        <div
          className="absolute -top-14 -right-14 w-44 h-44 rounded-full
          bg-[radial-gradient(circle,rgba(108,99,255,0.12),transparent_70%)]
          pointer-events-none"
        />

        {/* Header */}
        <div className="flex justify-between items-start mb-5 relative">
          <div>
            <h3 className="font-['Syne'] text-[15px] font-bold tracking-[-0.3px] text-text">
              New Message
            </h3>
            <p className="text-[12px] text-muted mt-0.5">
              Search for a user to start chatting
            </p>
          </div>
          <button
            onClick={onClose}
            className="
              w-7.5 h-7.5 flex items-center justify-center rounded-lg
              bg-surface-2 border border-white/7 text-muted text-[13px]
              cursor-pointer transition-all duration-200
              hover:bg-surface-3 hover:text-text hover:border-white/13
            "
          >
            ✕
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/6 mb-5" />

        {/* Search */}
        <div className="mb-5">
          <UserSearch onSelect={handleStartDM} />
        </div>

        {/* Footer */}
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="
              text-[13px] font-medium text-muted px-3.5 py-1.5 rounded-lg
              cursor-pointer transition-all duration-200
              hover:text-text hover:bg-surface-2
            "
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
