import React, { useState } from "react";

type AddTelegramChannelModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAddChannel: (username: string) => void;
  approvedChannels?: string[];
};

const AddTelegramChannelModal: React.FC<AddTelegramChannelModalProps> = ({
  isOpen,
  onClose,
  onAddChannel,
  approvedChannels = [],
}) => {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setUsername("");
    setError("");
    setLoading(false);
    onClose();
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = username.trim().replace(/^@/, "");
    if (!clean) {
      setError("Channel username is required");
      return;
    }
    if (clean.length < 5 || clean.length > 32) {
      setError("Username must be 5–32 characters");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onAddChannel(clean);
      setUsername("");
      setLoading(false);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to add channel");
      setLoading(false);
    }
  };

  const handleSelectApproved = (channel: string) => {
    const clean = channel.replace(/^@/, "").toLowerCase();
    setUsername(clean);
    setError("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(2px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) handleClose();
      }}
    >
      <div
        className="relative w-full max-w-md rounded-xl border border-neutral-800/50 bg-neutral-900 shadow-2xl transition-all duration-300 sm:max-w-lg"
        style={{
          boxShadow:
            "0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)",
        }}
      >
        <div className="flex items-center justify-between border-b border-neutral-800/40 px-5 py-4 sm:px-6 sm:py-5">
          <h2 className="text-lg font-semibold text-neutral-100 sm:text-xl">
            Add Telegram Channel
          </h2>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-all duration-200 hover:bg-neutral-800/60 hover:text-neutral-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9"
            aria-label="Close modal"
            disabled={loading}
          >
            <svg
              className="h-5 w-5 sm:h-6 sm:w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 sm:px-6 sm:py-6">
          {approvedChannels.length > 0 && (
            <div className="mb-4">
              <label className="mb-2 block text-xs font-medium text-neutral-400 sm:text-sm">
                Quick add (approved channels)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {approvedChannels.slice(0, 12).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => handleSelectApproved(ch)}
                    className="rounded-lg border border-neutral-700/60 bg-neutral-800/40 px-2.5 py-1.5 text-xs text-neutral-300 transition-colors hover:border-[#7FFFC9]/40 hover:bg-neutral-700/50 hover:text-neutral-100"
                  >
                    {ch.replace(/^@/, "")}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-6">
            <label
              htmlFor="tg-username"
              className="mb-2 block text-xs font-medium text-neutral-400 sm:text-sm"
            >
              Channel username
            </label>
            <div className="relative">
              <span className="absolute top-1/2 left-4 -translate-y-1/2 text-xs text-neutral-500 sm:text-sm">
                @
              </span>
              <input
                type="text"
                id="tg-username"
                className={`w-full rounded-lg border bg-neutral-900/40 px-4 py-2.5 pl-8 text-xs text-neutral-200 transition-all duration-300 placeholder:text-neutral-500 focus:border-[#7FFFC9]/60 focus:bg-neutral-900/60 focus:ring-2 focus:ring-[#7FFFC9]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:py-3 sm:pl-10 sm:text-sm ${
                  error
                    ? "border-red-500/60 focus:border-red-500 focus:ring-red-500/20"
                    : "border-neutral-800/60"
                }`}
                placeholder="channelname"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError("");
                }}
                disabled={loading}
                required
              />
            </div>
            {error && (
              <p className="mt-1.5 text-xs text-red-400 sm:text-sm">{error}</p>
            )}
            <p className="mt-1.5 text-xs text-neutral-500 sm:text-sm">
              Public channel username (e.g. t.me/channelname)
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg border-none bg-[#7FFFC9] px-4 py-2.5 text-xs font-semibold text-black shadow-lg transition-all duration-200 hover:bg-[#6EE8B8] hover:shadow-[0_0_16px_rgba(127,255,201,0.4)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:py-3 sm:text-sm"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Adding...</span>
              </span>
            ) : (
              "Add Channel"
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AddTelegramChannelModal;
