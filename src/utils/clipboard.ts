import toast from 'react-hot-toast';

export const copyToClipboard = async (
  text: string, 
  successMessage: string = "Copied to clipboard!", 
  errorMessage: string = "Failed to copy to clipboard"
): Promise<boolean> => {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        toast.success(successMessage);
        return true;
      } else {
        toast.error(errorMessage);
        return false;
      }
    }
  } catch (error) {
    console.error("Clipboard write failed:", error);
    toast.error(errorMessage);
    return false;
  }
};