import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DangerConfirmModal } from '../features/console/DangerConfirmModal';

describe('DangerConfirmModal Component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <DangerConfirmModal
        isOpen={false}
        commandStr="FLUSHALL"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders target command and disables unlock button initially', () => {
    render(
      <DangerConfirmModal
        isOpen={true}
        commandStr="FLUSHALL ASYNC"
        dangerReason="Purges all keyspaces"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('FLUSHALL ASYNC')).toBeInTheDocument();
    expect(screen.getByText('Dangerous Command Execution')).toBeInTheDocument();
    expect(screen.getByText('Purges all keyspaces')).toBeInTheDocument();

    const unlockBtn = screen.getByRole('button', { name: /unlock & execute/i });
    expect(unlockBtn).toBeDisabled();
  });

  it('enables unlock button only when user types CONFIRM', () => {
    const onConfirmMock = vi.fn();
    render(
      <DangerConfirmModal
        isOpen={true}
        commandStr="SHUTDOWN NOSAVE"
        onConfirm={onConfirmMock}
        onCancel={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/type confirm to authorize/i);
    const unlockBtn = screen.getByRole('button', { name: /unlock & execute/i });

    // Typing partial string
    fireEvent.change(input, { target: { value: 'CONF' } });
    expect(unlockBtn).toBeDisabled();

    // Typing full CONFIRM
    fireEvent.change(input, { target: { value: 'CONFIRM' } });
    expect(unlockBtn).not.toBeDisabled();

    // Clicking confirm triggers callback
    fireEvent.click(unlockBtn);
    expect(onConfirmMock).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancelMock = vi.fn();
    render(
      <DangerConfirmModal
        isOpen={true}
        commandStr="FLUSHDB"
        onConfirm={vi.fn()}
        onCancel={onCancelMock}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: /^cancel$/i });
    fireEvent.click(cancelBtn);
    expect(onCancelMock).toHaveBeenCalledTimes(1);
  });
});
