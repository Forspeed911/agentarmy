import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  private readonly username: string;
  private readonly passwordHash: string;

  constructor(private jwtService: JwtService) {
    this.username = process.env.AUTH_USERNAME || 'admin';
    const password = process.env.AUTH_PASSWORD || 'admin';
    this.passwordHash = bcrypt.hashSync(password, 10);
  }

  async login(username: string, password: string) {
    if (username !== this.username) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = bcrypt.compareSync(password, this.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: username, role: 'admin' };
    return {
      access_token: this.jwtService.sign(payload),
      username,
    };
  }

  validateToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
