import React, { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  isLoading = false,
  style,
  disabled,
  ...props
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return {
          background: 'var(--accent)',
          color: 'var(--bg-primary)',
          border: '1px solid var(--accent)',
          fontWeight: 600,
        };
      case 'secondary':
        return {
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-medium)',
          fontWeight: 500,
        };
      case 'ghost':
        return {
          background: 'transparent',
          color: 'var(--text-secondary)',
          border: '1px solid transparent',
          fontWeight: 500,
        };
      case 'danger':
        return {
          background: 'var(--status-danger)',
          color: '#ffffff',
          border: '1px solid var(--status-danger)',
          fontWeight: 600,
        };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return { padding: '4px 10px', fontSize: '12px', height: '28px' };
      case 'md':
        return { padding: '8px 16px', fontSize: '13px', height: '36px' };
      case 'lg':
        return { padding: '12px 24px', fontSize: '15px', height: '44px' };
    }
  };

  return (
    <button
      disabled={disabled || isLoading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        borderRadius: 'var(--radius-sm)',
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all var(--transition-fast)',
        fontFamily: 'var(--font-sans)',
        ...getVariantStyles(),
        ...getSizeStyles(),
        ...style,
      }}
      {...props}
    >
      {isLoading ? (
        <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
      ) : (
        icon && <span>{icon}</span>
      )}
      {children}
    </button>
  );
};
