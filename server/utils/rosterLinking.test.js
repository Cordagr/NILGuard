import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canLinkRosterPlayer,
  canRegisterWithCoachInvite,
  markRosterEmailConflicts,
  reconcileVerifiedRosterEmail,
  unlinkRosterPlayerForEmailChange
} from './rosterLinking.js';

test('an unverified athlete cannot claim a roster row', () => {
  const player = { email: 'athlete@school.edu' };
  assert.equal(canLinkRosterPlayer({ _id: 'athlete-1', email: 'athlete@school.edu' }, player), false);
});

test('an athlete cannot link a row for a different verified email or another account', () => {
  const athlete = {
    _id: 'athlete-1',
    email: 'athlete@school.edu',
    emailVerifiedAt: new Date()
  };
  assert.equal(canLinkRosterPlayer(athlete, { email: 'someone-else@school.edu' }), false);
  assert.equal(canLinkRosterPlayer(athlete, {
    email: 'athlete@school.edu',
    linkedStudentUserId: 'athlete-2'
  }), false);
  assert.equal(canLinkRosterPlayer(athlete, { email: ' ATHLETE@SCHOOL.EDU ' }), true);
});

test('student registration requires a coach invite for the roster email', () => {
  const invite = { email: 'athlete@school.edu' };
  const player = { email: ' ATHLETE@SCHOOL.EDU ', linkStatus: 'invited' };
  assert.equal(canRegisterWithCoachInvite('Athlete@School.edu', invite, player), true);
  assert.equal(canRegisterWithCoachInvite('other@school.edu', invite, player), false);
  assert.equal(canRegisterWithCoachInvite('athlete@school.edu', null, player), false);
  assert.equal(canRegisterWithCoachInvite('athlete@school.edu', invite, {
    ...player,
    linkStatus: 'needs_review'
  }), false);
});

test('changing a roster email removes the previous account link and consent', () => {
  const updatedPlayer = unlinkRosterPlayerForEmailChange({
    email: 'old@school.edu',
    linkedStudentUserId: 'athlete-1',
    educationConsentAt: new Date()
  }, ' New@School.edu ');
  assert.equal(updatedPlayer.email, 'new@school.edu');
  assert.equal(updatedPlayer.linkedStudentUserId, null);
  assert.equal(updatedPlayer.educationConsentAt, null);
  assert.equal(updatedPlayer.linkStatus, 'no_account');
});

test('conflicting names are reviewed instead of linked after verification', () => {
  const rosters = [
    { rosterId: 'one', players: [{ email: 'a@school.edu', firstName: 'Alex', lastName: 'Lee' }] },
    { rosterId: 'two', players: [{ email: 'a@school.edu', firstName: 'Jordan', lastName: 'Lee' }] }
  ];
  const reviewed = reconcileVerifiedRosterEmail(rosters, 'a@school.edu', 'athlete-1');
  assert.equal(reviewed.length, 2);
  assert.ok(reviewed.every((roster) => roster.players[0].linkStatus === 'needs_review'));
  assert.equal(markRosterEmailConflicts(rosters).length, 2);
});

test('duplicate emails within a roster are marked for review', () => {
  const rosters = [{
    rosterId: 'one',
    players: [
      { email: 'a@school.edu', firstName: 'Alex', lastName: 'Lee' },
      { email: ' A@School.edu ', firstName: 'Alex', lastName: 'Lee' }
    ]
  }];
  const reviewed = reconcileVerifiedRosterEmail(rosters, 'a@school.edu', 'athlete-1');
  assert.equal(reviewed[0].players.length, 2);
  assert.ok(reviewed[0].players.every((player) => player.linkStatus === 'needs_review'));
  assert.ok(reviewed[0].players.every((player) => player.linkReviewReason === 'duplicate_email'));
});
