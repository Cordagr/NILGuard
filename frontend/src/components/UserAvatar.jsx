import React from 'react';
import defaultAvatar from '../assets/ProfileIcon.png';
import '../styles/components/UserAvatar.css';

export default function UserAvatar({ src, className = '', alt = '' }) {
  return <img className={`user-avatar ${className}`.trim()} src={src || defaultAvatar} alt={alt} />;
}
