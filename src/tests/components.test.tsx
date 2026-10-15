import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BloodGroupPill } from '../components/domain/BloodGroupPill';
import { ExpiryChip } from '../components/domain/ExpiryChip';
import { StatusChip } from '../components/domain/StatusChip';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

describe('UI and Domain Component Library', () => {
  it('renders BloodGroupPill with correct group label', () => {
    render(<BloodGroupPill group="O-" />);
    expect(screen.getByText('O-')).toBeInTheDocument();
  });

  it('renders ExpiryChip showing countdown in hours/minutes', () => {
    const simTime = '2026-10-15T08:00:00.000Z';
    const expiresAt = '2026-10-15T12:30:00.000Z'; // 4h 30m
    render(<ExpiryChip expiresAt={expiresAt} simTime={simTime} />);
    expect(screen.getByText(/4h 30m/)).toBeInTheDocument();
  });

  it('renders StatusChip with status text', () => {
    render(<StatusChip status="FEASIBLE" />);
    expect(screen.getByText('Feasible')).toBeInTheDocument();

    render(<StatusChip status="IN_TRANSIT" />);
    expect(screen.getByText('In Transit')).toBeInTheDocument();
  });

  it('renders Button with custom label and accessible attributes', () => {
    render(<Button variant="primary">Reserve Component</Button>);
    const btn = screen.getByRole('button', { name: /Reserve Component/i });
    expect(btn).toBeInTheDocument();
  });

  it('renders Card with content children', () => {
    render(
      <Card>
        <span data-testid="card-child">Clinical Test Card</span>
      </Card>
    );
    expect(screen.getByTestId('card-child')).toBeInTheDocument();
  });
});
