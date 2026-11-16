export function normalizeRosterEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function canLinkRosterPlayer(user, player) {
  return Boolean(
    user?.emailVerifiedAt &&
    normalizeRosterEmail(user.email) &&
    normalizeRosterEmail(user.email) === normalizeRosterEmail(player?.email) &&
    (!player?.linkedStudentUserId || player.linkedStudentUserId === String(user._id || user.id))
  );
}

export function canRegisterWithCoachInvite(email, invite, player) {
  const normalizedEmail = normalizeRosterEmail(email);
  return Boolean(
    normalizedEmail &&
    normalizeRosterEmail(invite?.email) === normalizedEmail &&
    normalizeRosterEmail(player?.email) === normalizedEmail &&
    !player?.linkedStudentUserId &&
    player?.linkStatus !== 'needs_review'
  );
}

export function unlinkRosterPlayerForEmailChange(player, email) {
  return {
    ...player,
    email: normalizeRosterEmail(email),
    linkedStudentUserId: null,
    educationConsentAt: null,
    educationRevokedAt: null,
    linkStatus: 'no_account',
    linkReviewReason: null
  };
}

export function markRosterEmailConflicts(rosters) {
  const rowsByEmail = new Map();
  rosters.forEach((roster, rosterIndex) => {
    (roster.players || []).forEach((player, playerIndex) => {
      const email = normalizeRosterEmail(player.email);
      if (!email) {
        return;
      }
      const rows = rowsByEmail.get(email) || [];
      rows.push({ rosterIndex, playerIndex, player });
      rowsByEmail.set(email, rows);
    });
  });

  const updatedRosters = new Map();
  rowsByEmail.forEach((rows) => {
    const nameSet = new Set(rows.map(({ player }) => (
      `${String(player.firstName || '').trim().toLowerCase()} ${String(player.lastName || '').trim().toLowerCase()}`
    )));
    const duplicateRosterIds = new Set();
    const rowsByRoster = new Map();
    rows.forEach((row) => {
      const entries = rowsByRoster.get(row.rosterIndex) || [];
      entries.push(row);
      rowsByRoster.set(row.rosterIndex, entries);
    });
    rowsByRoster.forEach((rosterRows, rosterIndex) => {
      if (rosterRows.length > 1) {
        duplicateRosterIds.add(rosterIndex);
      }
    });

    rows.forEach(({ rosterIndex, playerIndex, player }) => {
      const duplicateEmail = duplicateRosterIds.has(rosterIndex);
      const conflictingNames = nameSet.size > 1;
      const needsReview = duplicateEmail || conflictingNames;
      if (
        !needsReview &&
        !['duplicate_email', 'conflicting_names'].includes(player.linkReviewReason)
      ) {
        return;
      }
      const roster = updatedRosters.get(rosterIndex) || {
        ...rosters[rosterIndex],
        players: [...rosters[rosterIndex].players]
      };
      roster.players[playerIndex] = needsReview
        ? {
            ...player,
            linkedStudentUserId: null,
            educationConsentAt: null,
            linkStatus: 'needs_review',
            linkReviewReason: duplicateEmail ? 'duplicate_email' : 'conflicting_names'
          }
        : {
            ...player,
            linkStatus: player.linkedStudentUserId
              ? 'linked'
              : player.inviteSentAt
                ? 'invited'
                : 'no_account',
            linkReviewReason: null
          };
      updatedRosters.set(rosterIndex, roster);
    });
  });

  return Array.from(updatedRosters.values());
}

export function reconcileVerifiedRosterEmail(
  rosters,
  email,
  userId,
  now = new Date(),
  { allowPendingVerification = false } = {}
) {
  const normalizedEmail = normalizeRosterEmail(email);
  const matches = [];

  rosters.forEach((roster, rosterIndex) => {
    (roster.players || []).forEach((player, playerIndex) => {
      if (
        normalizeRosterEmail(player.email) === normalizedEmail &&
        (!player.linkRequiresInvite || allowPendingVerification)
      ) {
        matches.push({ rosterIndex, playerIndex, roster, player });
      }
    });
  });

  const names = new Set(matches.map(({ player }) => (
    `${String(player.firstName || '').trim().toLowerCase()} ${String(player.lastName || '').trim().toLowerCase()}`
  )));
  const conflictingNames = names.size > 1;
  const duplicateRows = new Set();
  const countsByRoster = new Map();

  matches.forEach((match) => {
    countsByRoster.set(match.rosterIndex, (countsByRoster.get(match.rosterIndex) || 0) + 1);
  });
  matches.forEach((match) => {
    if (countsByRoster.get(match.rosterIndex) > 1) {
      duplicateRows.add(`${match.rosterIndex}:${match.playerIndex}`);
    }
  });

  const updatedRosters = new Map();
  matches.forEach(({ rosterIndex, playerIndex, roster, player }) => {
    const updatedRoster = updatedRosters.get(rosterIndex) || {
      ...roster,
      players: [...roster.players]
    };
    const hasConflictingLink =
      player.linkedStudentUserId && player.linkedStudentUserId !== String(userId);
    const needsReview = conflictingNames ||
      duplicateRows.has(`${rosterIndex}:${playerIndex}`) ||
      hasConflictingLink;
    updatedRoster.players[playerIndex] = needsReview
      ? {
          ...player,
          linkedStudentUserId: null,
          educationConsentAt: null,
          linkStatus: 'needs_review',
          linkReviewReason: hasConflictingLink
            ? 'email_already_linked'
            : duplicateRows.has(`${rosterIndex}:${playerIndex}`)
              ? 'duplicate_email'
              : 'conflicting_names'
        }
      : {
          ...player,
          linkedStudentUserId: String(userId),
          educationConsentAt: player.linkedStudentUserId === String(userId)
            ? player.educationConsentAt || null
            : null,
          linkStatus: 'linked',
          linkReviewReason: null,
          linkRequiresInvite: false,
          linkedAt: now
        };
    updatedRosters.set(rosterIndex, updatedRoster);
  });

  return Array.from(updatedRosters.values());
}
