import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types';

export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ 
        message: `Insufficient permissions. Required roles: ${allowedRoles.join(', ')}. Your role: ${req.user.role}` 
      });
      return;
    }

    next();
  };
};

export const requireAdmin = requireRole(UserRole.ADMIN);

export const requireAdminOrSelf = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const isAdmin = req.user.role === UserRole.ADMIN;
  const isOwner = req.user.id === req.params.id;

  if (!isAdmin && !isOwner) {
    res.status(403).json({ 
      message: 'Insufficient permissions. Admin role required or must be accessing own resource.' 
    });
    return;
  }

  next();
};

export const requireFundraiserOrAdmin = requireRole(UserRole.FUNDRAISER, UserRole.ADMIN);