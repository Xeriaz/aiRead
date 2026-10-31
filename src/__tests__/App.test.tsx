import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('aiRead App', () => {
  it('renders header, light theme by default, and saves a reading entry to IndexedDB', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('aiRead')).toBeInTheDocument();
    expect(screen.getByText('Read Image Data')).toBeInTheDocument();

    const titleInput = screen.getByLabelText(/Document \/ Image Title/i);
    const notesInput = screen.getByLabelText(/Gathered Data \/ Extracted Text/i);

    await user.type(titleInput, 'Invoice #104');
    await user.type(notesInput, 'Total: $42.50');
    await user.click(screen.getByRole('button', { name: /Save Entry/i }));

    expect(await screen.findByText('Invoice #104')).toBeInTheDocument();
    expect(screen.getByText('Total: $42.50')).toBeInTheDocument();
  });

  it('toggles between light and dark theme', async () => {
    const user = userEvent.setup();
    render(<App />);

    const toggleButton = screen.getByRole('button', { name: /Toggle theme/i });
    expect(document.documentElement.classList.contains('light')).toBe(true);

    await user.click(toggleButton);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('aiRead_theme')).toBe('dark');
  });
});
