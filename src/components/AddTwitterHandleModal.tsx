import React, { useState } from "react";

type AddTwitterHandleModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAddTwitterHandle: (username: string) => void;
};

const AddTwitterHandleModal: React.FC<AddTwitterHandleModalProps> = ({
  isOpen,
  onClose,
  onAddTwitterHandle,
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

    // Validate username
    if (!username.trim()) {
      setError("Twitter username is required");
      return;
    }

    // Remove @ symbol if present
    const cleanUsername = username.trim().replace(/^@/, "");

    // Basic Twitter username validation (alphanumeric and underscores, 1-15 chars)
    if (!/^[A-Za-z0-9_]{1,15}$/.test(cleanUsername)) {
      setError("Invalid Twitter username format");
      return;
    }

    // Clear error and proceed
    setError("");
    setLoading(true);

    try {
      await onAddTwitterHandle(cleanUsername);
      setUsername("");
      setLoading(false);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to add Twitter account");
      setLoading(false);
    }
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsername(value);
    // Clear error when user starts typing
    if (error) {
      setError("");
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(2px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          handleClose();
        }
      }}
    >
       <div 
        className="relative w-full max-w-md rounded-xl border border-neutral-800/50 bg-neutral-900 shadow-2xl transition-all duration-300 sm:max-w-lg"
        style={{
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800/40 px-5 py-4 sm:px-6 sm:py-5">
          <h2 className="text-lg font-semibold text-neutral-100 sm:text-xl">
            Add Twitter Handle
          </h2>
       <button 
            onClick={handleClose} 
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-all duration-200 hover:bg-neutral-800/60 hover:text-neutral-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed sm:h-9 sm:w-9"
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

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="px-5 py-5 sm:px-6 sm:py-6">
          {/* Username Input */}
          <div className="mb-6">
            <label 
              htmlFor="username" 
              className="mb-2 block text-xs font-medium text-neutral-400 sm:text-sm"
            >
              Twitter Username
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-neutral-500 sm:text-sm">
                @
              </span>
              <input
                type="text"
                id="username"
                className={`w-full rounded-lg border bg-neutral-900/40 px-4 py-2.5 pl-8 text-xs text-neutral-200 placeholder:text-neutral-500 transition-all duration-300 focus:border-[#7FFFC9]/60 focus:outline-none focus:ring-2 focus:ring-[#7FFFC9]/20 focus:bg-neutral-900/60 disabled:opacity-50 disabled:cursor-not-allowed sm:px-5 sm:py-3 sm:text-sm sm:pl-10 ${
                  error
                    ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-neutral-800/60'
                }`}
                placeholder="elonmusk"
                value={username}
                onChange={handleUsernameChange}
                disabled={loading}
                required
              />
            </div>
            {error && (
              <p className="mt-1.5 text-xs text-red-400 sm:text-sm">
                {error}
              </p>
            )}
            <p className="mt-1.5 text-xs text-neutral-500 sm:text-sm">
              Enter the Twitter username without the @ symbol
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg border-none bg-[#7FFFC9] px-4 py-2.5 text-xs font-semibold text-black shadow-lg transition-all duration-200 hover:bg-[#6EE8B8] hover:shadow-[0_0_16px_rgba(127,255,201,0.4),0_4px_12px_rgba(127,255,201,0.2)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#7FFFC9] sm:px-5 sm:py-3 sm:text-sm"
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
                  ></circle>
                  <path 
                    className="opacity-75" 
                    fill="currentColor" 
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span>Adding...</span>
              </span>
            ) : (
              'Add Twitter Handle'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AddTwitterHandleModal;
