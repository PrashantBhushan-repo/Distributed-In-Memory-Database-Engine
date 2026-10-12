import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StringEditor } from '../features/keys/detail/StringEditor';
import { HashEditor } from '../features/keys/detail/HashEditor';
import { KeyDetail } from '../features/keys/types';

describe('StringEditor Component', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, command: 'SET config:site_title "New Site Title 2026"' }),
    } as any);
  });

  const mockStringDetail: KeyDetail = {
    name: 'config:site_title',
    type: 'string',
    ttl: -1,
    ttlMs: -1,
    encoding: 'raw',
    size: 1,
    memoryBytes: 48,
    value: 'RedisX Ultra Dashboard',
    formatHint: 'text',
  };

  it('renders string key content and handles edits and dirty state', async () => {
    const onSaveMock = vi.fn().mockResolvedValue(undefined);
    render(
      <StringEditor
        detail={mockStringDetail}
        isViewer={false}
        onSave={onSaveMock}
      />
    );

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('RedisX Ultra Dashboard');

    // Save button should initially be disabled since dirty is false
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).toBeDisabled();

    // Modify textarea value
    fireEvent.change(textarea, { target: { value: 'New Site Title 2026' } });
    expect(textarea).toHaveValue('New Site Title 2026');
    expect(saveBtn).not.toBeDisabled();

    // Save changes
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(onSaveMock).toHaveBeenCalledWith('New Site Title 2026', expect.stringContaining('SET'));
    });
  });

  it('renders JSON formatting and Hex views when tabs are toggled', () => {
    const jsonDetail: KeyDetail = {
      ...mockStringDetail,
      value: 'RedisX',
      formatHint: 'text',
    };

    render(
      <StringEditor
        detail={jsonDetail}
        isViewer={false}
        onSave={vi.fn()}
      />
    );

    // Click Hex tab
    const hexTab = screen.getByRole('button', { name: /hex/i });
    fireEvent.click(hexTab);
    // 'RedisX' in hex is '52 65 64 69 73 58'
    expect(screen.getByText(/52 65 64 69 73 58/i)).toBeInTheDocument();
  });
});

describe('HashEditor Component', () => {
  const mockHashDetail: KeyDetail = {
    name: 'user:1001:profile',
    type: 'hash',
    ttl: 3600,
    ttlMs: 3600000,
    encoding: 'listpack',
    size: 2,
    memoryBytes: 128,
    hashEntries: [
      { field: 'username', value: 'alice_admin' },
      { field: 'role', value: 'sre_lead' },
    ],
  };

  it('renders hash entries list and filters fields by search query', () => {
    render(
      <HashEditor
        detail={mockHashDetail}
        isViewer={false}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText('username')).toBeInTheDocument();
    expect(screen.getByText('alice_admin')).toBeInTheDocument();
    expect(screen.getByText('role')).toBeInTheDocument();
    expect(screen.getByText('sre_lead')).toBeInTheDocument();

    // Filter fields by search
    const searchInput = screen.getByPlaceholderText(/search fields or values/i);
    fireEvent.change(searchInput, { target: { value: 'alice' } });

    expect(screen.getByText('username')).toBeInTheDocument();
    expect(screen.queryByText('role')).not.toBeInTheDocument();
  });

  it('disables add field functionality in viewer mode', () => {
    render(
      <HashEditor
        detail={mockHashDetail}
        isViewer={true}
        onRefresh={vi.fn()}
      />
    );

    const addBtn = screen.getByRole('button', { name: /add field/i });
    expect(addBtn).toBeDisabled();
  });
});
