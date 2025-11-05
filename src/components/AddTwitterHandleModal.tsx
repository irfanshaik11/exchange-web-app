import React, { useState } from 'react';

type AddTwitterHandleModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAddTwitterHandle: (username: string) => void;
};

const AddTwitterHandleModal: React.FC<AddTwitterHandleModalProps> = ({ 
  isOpen, 
  onClose, 
  onAddTwitterHandle 
}) => {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate username
    if (!username.trim()) {
      setError('Twitter username is required');
      return;
    }
    
    // Remove @ symbol if present
    const cleanUsername = username.trim().replace(/^@/, '');
    
    // Basic Twitter username validation (alphanumeric and underscores, 1-15 chars)
    if (!/^[A-Za-z0-9_]{1,15}$/.test(cleanUsername)) {
      setError('Invalid Twitter username format');
      return;
    }
    
    // Clear error and proceed
    setError('');
    setLoading(true);
    
    try {
      await onAddTwitterHandle(cleanUsername);
      setUsername('');
      setLoading(false);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add Twitter account');
      setLoading(false);
    }
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsername(value);
    // Clear error when user starts typing
    if (error) {
      setError('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-neutral-900 border border-blue-700 shadow-2xl shadow-blue-500/20 rounded-lg p-6 w-96">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-white">Add Twitter Handle</h2>
          <button 
            onClick={onClose} 
            className="text-neutral-400 hover:text-white text-3xl cursor-pointer"
            disabled={loading}
          >
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="username" className="block text-sm font-medium text-neutral-400 mb-1">
              Twitter Username
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-500">
                @
              </span>
              <input
                type="text"
                id="username"
                className={`bg-neutral-800 border rounded px-3 py-2 pl-8 w-full text-neutral-200 focus:outline-none ${
                  error 
                    ? 'border-red-500 focus:border-red-500' 
                    : 'border-neutral-700 focus:border-blue-500'
                }`}
                placeholder="elonmusk"
                value={username}
                onChange={handleUsernameChange}
                disabled={loading}
                required
              />
            </div>
            {error && (
              <p className="text-red-500 text-xs mt-1">{error}</p>
            )}
            <p className="text-neutral-500 text-xs mt-1">
              Enter the Twitter username without the @ symbol
            </p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full font-semibold py-2 rounded transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: '#1DA1F2',
              color: '#FFFFFF',
              border: 'none'
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#1A8CD8';
                e.currentTarget.style.boxShadow = '0 0 8px rgba(29, 161, 242, 0.3), 0 0 16px rgba(29, 161, 242, 0.15)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#1DA1F2';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {loading ? 'Adding...' : 'Add Twitter Handle'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AddTwitterHandleModal;

