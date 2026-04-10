const NCAA_SCHOOL_DIRECTORY = [
  {
    division: 'Division I',
    schools: [
      { school: 'University of Alabama', domains: ['ua.edu'] },
      { school: 'Ohio State University', domains: ['osu.edu'] },
      { school: 'University of Michigan', domains: ['umich.edu'] },
      { school: 'University of Texas at Austin', domains: ['utexas.edu'] },
      { school: 'University of Georgia', domains: ['uga.edu'] },
      { school: 'Louisiana State University', domains: ['lsu.edu'] },
      { school: 'University of Florida', domains: ['ufl.edu'] },
      { school: 'University of Southern California', domains: ['usc.edu'] },
      { school: 'University of Oregon', domains: ['uoregon.edu'] },
      { school: 'University of Oklahoma', domains: ['ou.edu'] },
      { school: 'University of Notre Dame', domains: ['nd.edu'] },
      { school: 'Clemson University', domains: ['clemson.edu'] },
      { school: 'Penn State University', domains: ['psu.edu'] },
      { school: 'University of Tennessee', domains: ['utk.edu', 'tennessee.edu'] },
      { school: 'Texas A&M University', domains: ['tamu.edu'] },
      { school: 'University of North Texas', domains: ['unt.edu'] }
    ]
  },
  {
    division: 'Division II',
    schools: [
      { school: 'Grand Valley State University', domains: ['gvsu.edu'] },
      { school: 'California State University, Dominguez Hills', domains: ['csudh.edu'] },
      { school: 'West Texas A&M University', domains: ['wtamu.edu'] },
      { school: 'Minnesota State University, Mankato', domains: ['mnsu.edu'] },
      { school: 'Colorado School of Mines', domains: ['mines.edu'] },
      { school: 'Augustana University', domains: ['augie.edu'] },
      { school: 'University of Tampa', domains: ['ut.edu'] },
      { school: 'Bentley University', domains: ['bentley.edu'] },
      { school: 'Rollins College', domains: ['rollins.edu'] },
      { school: 'Ferris State University', domains: ['ferris.edu'] },
      { school: 'University of Central Missouri', domains: ['ucmo.edu'] },
      { school: 'Pittsburg State University', domains: ['pittstate.edu'] },
      { school: 'Valdosta State University', domains: ['valdosta.edu'] },
      { school: 'Nova Southeastern University', domains: ['nova.edu'] },
      { school: 'University of Indianapolis', domains: ['uindy.edu'] }
    ]
  },
  {
    division: 'Division III',
    schools: [
      { school: 'Johns Hopkins University', domains: ['jhu.edu'] },
      { school: 'Emory University', domains: ['emory.edu'] },
      { school: 'Tufts University', domains: ['tufts.edu'] },
      { school: 'Massachusetts Institute of Technology', domains: ['mit.edu'] },
      { school: 'Carnegie Mellon University', domains: ['cmu.edu'] },
      { school: 'University of Chicago', domains: ['uchicago.edu'] },
      { school: 'Washington University in St. Louis', domains: ['wustl.edu'] },
      { school: 'Williams College', domains: ['williams.edu'] },
      { school: 'Amherst College', domains: ['amherst.edu'] },
      { school: 'Pomona College', domains: ['pomona.edu'] },
      { school: 'California Institute of Technology', domains: ['caltech.edu'] },
      { school: 'Middlebury College', domains: ['middlebury.edu'] },
      { school: 'Bowdoin College', domains: ['bowdoin.edu'] },
      { school: 'Claremont McKenna College', domains: ['cmc.edu'] },
      { school: 'Wesleyan University', domains: ['wesleyan.edu'] }
    ]
  }
];

const FLAT_SCHOOL_DIRECTORY = NCAA_SCHOOL_DIRECTORY.flatMap((divisionGroup) =>
  divisionGroup.schools.flatMap((schoolEntry) =>
    schoolEntry.domains.map((domain) => ({
      division: divisionGroup.division,
      school: schoolEntry.school,
      domain: domain.toLowerCase()
    }))
  )
);

export function getSupportedSchoolCounts() {
  return NCAA_SCHOOL_DIRECTORY.map((divisionGroup) => ({
    division: divisionGroup.division,
    schoolCount: divisionGroup.schools.length
  }));
}

export function resolveSchoolFromEmail(email) {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const emailDomain = normalizedEmail.split('@')[1] || '';

  if (!emailDomain) {
    return null;
  }

  const matchedSchool = FLAT_SCHOOL_DIRECTORY.find(
    (schoolEntry) => emailDomain === schoolEntry.domain || emailDomain.endsWith(`.${schoolEntry.domain}`)
  );

  if (!matchedSchool) {
    return null;
  }

  return {
    school: matchedSchool.school,
    division: matchedSchool.division,
    primaryDomain: matchedSchool.domain
  };
}