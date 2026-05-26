import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, Check, Loader2, Info } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';
import { Input } from './Input';

export interface ActionConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string | string[];
  confirmationText?: string;
  confirmButtonText?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  children?: React.ReactNode;
}

export const ActionConfirmationModal: React.FC<ActionConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmationText,
  confirmButtonText = 'Confirm',
  isDestructive = true,
  isLoading = false,
  children
}) => {
  const [inputText, setInputText] = useState('');

  // Reset input when modal opens
  useEffect(() => {
    if (isOpen) {
      setInputText('');
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (confirmationText && inputText !== confirmationText) return;
    onConfirm();
  };

  const isConfirmDisabled = (confirmationText && inputText !== confirmationText) || isLoading;

  const colorScheme = isDestructive 
    ? { icon: 'text-rose-500', bg: 'bg-rose-500/10 border-rose-500/20', buttonBg: 'bg-rose-600 hover:bg-rose-700', buttonRing: 'focus:ring-rose-500' }
    : { icon: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20', buttonBg: 'bg-amber-600 hover:bg-amber-700', buttonRing: 'focus:ring-amber-500' };

  return (
    <Modal open={isOpen} onClose={isLoading ? () => {} : onClose} title={title}>
      <div className="space-y-5 relative">
        {/* Warning Header */}
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${colorScheme.bg}`}>
          {isDestructive ? (
            <AlertTriangle className={`mt-0.5 shrink-0 ${colorScheme.icon}`} size={20} />
          ) : (
            <Info className={`mt-0.5 shrink-0 ${colorScheme.icon}`} size={20} />
          )}
          <div className="text-sm text-slate-800 font-medium leading-relaxed">
            {Array.isArray(description) ? (
              <ul className="list-disc pl-4 space-y-1">
                {description.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>{description}</p>
            )}
          </div>
        </div>

        {/* Custom Body Forms */}
        {children && (
          <div className="pt-2">
            {children}
          </div>
        )}

        {/* Double Confirmation Input */}
        {confirmationText && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-600">
              To proceed, please type <span className="font-mono bg-slate-500/20 px-1.5 py-0.5 rounded text-slate-900 border border-slate-500/30">{confirmationText}</span> below:
            </p>
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Type ${confirmationText} to confirm...`}
              disabled={isLoading}
              className="font-mono text-sm"
              autoFocus
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className={`${colorScheme.buttonBg} text-white shadow-sm border-0`}
            icon={isLoading ? <Loader2 size={16} className="animate-spin" /> : (isDestructive ? <AlertTriangle size={16} /> : <Check size={16} />)}
          >
            {isLoading ? 'Processing...' : confirmButtonText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
