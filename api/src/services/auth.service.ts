import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { User, IUser, UserRole } from '../models/user.model';
import { config } from '../config';
import { UnauthorizedError, ConflictError, BadRequestError } from '../errors/appError';

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  hospitalId?: string | null | undefined;
  jti?: string;
}

export class AuthService {
  static async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456, // 19 MiB standard
      timeCost: 2,
    });
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  static generateAccessToken(user: IUser): string {
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      hospitalId: user.hospitalId ?? null,
      jti: randomUUID(),
    };
    return jwt.sign(payload, config.jwtAccessSecret, { expiresIn: '15m' });
  }

  static generateRefreshToken(user: IUser): { token: string; expiresAt: Date } {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const token = jwt.sign(
      { userId: user.id, jti: randomUUID() },
      config.jwtRefreshSecret,
      { expiresIn: '7d' }
    );
    return { token, expiresAt };
  }

  static verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, config.jwtAccessSecret) as TokenPayload;
  }

  static verifyRefreshToken(token: string): { userId: string } {
    return jwt.verify(token, config.jwtRefreshSecret) as { userId: string };
  }

  static async login(email: string, password: string): Promise<{ user: IUser; accessToken: string; refreshToken: string }> {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isValid = await this.verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const accessToken = this.generateAccessToken(user);
    const { token: refreshToken, expiresAt } = this.generateRefreshToken(user);

    // Save refresh token, prune expired ones
    const now = new Date();
    user.refreshTokens = user.refreshTokens.filter((rt) => rt.expiresAt > now);
    user.refreshTokens.push({ token: refreshToken, expiresAt, createdAt: now });
    await user.save();

    return { user, accessToken, refreshToken };
  }

  static async refresh(token: string): Promise<{ accessToken: string; newRefreshToken: string; user: IUser }> {
    if (!token) {
      throw new UnauthorizedError('Refresh token required');
    }

    let payload: { userId: string };
    try {
      payload = this.verifyRefreshToken(token);
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const user = await User.findOne({ id: payload.userId });
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Check if refresh token exists in user record
    const tokenEntryIndex = user.refreshTokens.findIndex((rt) => rt.token === token);
    if (tokenEntryIndex === -1) {
      // Possible token reuse attack: revoke all tokens for this user
      user.refreshTokens = [];
      await user.save();
      throw new UnauthorizedError('Invalid refresh token: possible reuse detected');
    }

    // Rotate: Remove old refresh token, create new pair
    user.refreshTokens.splice(tokenEntryIndex, 1);

    const now = new Date();
    user.refreshTokens = user.refreshTokens.filter((rt) => rt.expiresAt > now);

    const accessToken = this.generateAccessToken(user);
    const { token: newRefreshToken, expiresAt } = this.generateRefreshToken(user);

    user.refreshTokens.push({ token: newRefreshToken, expiresAt, createdAt: now });
    await user.save();

    return { accessToken, newRefreshToken, user };
  }

  static async logout(userId: string, refreshToken?: string): Promise<void> {
    const user = await User.findOne({ id: userId });
    if (!user) return;

    if (refreshToken) {
      user.refreshTokens = user.refreshTokens.filter((rt) => rt.token !== refreshToken);
    } else {
      user.refreshTokens = [];
    }
    await user.save();
  }

  static async register(data: {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    hospitalId?: string | null;
  }): Promise<IUser> {
    const existing = await User.findOne({ email: data.email.toLowerCase().trim() });
    if (existing) {
      throw new ConflictError('A user with this email already exists');
    }

    if (data.role === 'COORDINATOR' && !data.hospitalId) {
      throw new BadRequestError('Hospital ID is required for COORDINATOR role');
    }

    const count = await User.countDocuments();
    const id = `USR-${1000 + count + 1}`;
    const passwordHash = await this.hashPassword(data.password);

    const user = await User.create({
      id,
      email: data.email.toLowerCase().trim(),
      passwordHash,
      name: data.name,
      role: data.role,
      hospitalId: data.role === 'COORDINATOR' ? data.hospitalId : null,
    });

    return user;
  }
}
