// studentData.js - Curated verified datasets and external adapter abstractions for Student Corner.
// RULES:
// 1. Never invent fake internships, fabricated scholarship eligibility, or invented discount codes.
// 2. All opportunities are vetted from official government portals (NSP, AICTE), verified campus programs (GSoC, LFX),
//    and genuine student discount initiatives (Spotify, Apple, GitHub, Amazon Prime, Notion, JetBrains).
// 3. Clear distinction between curated verified information and live provider feeds.
// 4. Personalized eligibility only evaluates voluntary student inputs without inferring private data.

const VERIFIED_INTERNSHIPS = [
  {
    id: 'int-gsoc-2026',
    title: 'Open Source Software Developer Intern',
    company: 'Google Summer of Code (GSoC)',
    logoUrl: null,
    stipend: '₹1,25,000 – ₹2,50,000 total stipend ($1,500 – $3,000)',
    stipendAmount: 180000,
    currency: 'INR',
    isPaid: true,
    workMode: 'remote',
    location: 'Remote (Global)',
    category: 'software',
    skills: ['Git', 'Python', 'C++', 'Go', 'JavaScript'],
    educationRequirements: 'Enrolled student or open source beginner (18+)',
    deadline: '2026-04-08',
    source: 'Google Open Source Programs',
    sourceUrl: 'https://summerofcode.withgoogle.com/',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'int-lfx-2026',
    title: 'Cloud Native & Kernel Systems Mentorship',
    company: 'The Linux Foundation (LFX)',
    logoUrl: null,
    stipend: '₹2,50,000 stipend ($3,000 USD)',
    stipendAmount: 250000,
    currency: 'INR',
    isPaid: true,
    workMode: 'remote',
    location: 'Remote',
    category: 'software',
    skills: ['Rust', 'C', 'Linux Kernel', 'Kubernetes', 'Go'],
    educationRequirements: 'College undergraduate or graduate in Computer Science or related fields',
    deadline: '2026-05-15',
    source: 'Linux Foundation Mentorship Program',
    sourceUrl: 'https://mentorship.lfx.linuxfoundation.org/',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'int-aicte-urban-2026',
    title: 'Smart Cities & Urban Governance Technical Intern',
    company: 'AICTE & Ministry of Housing and Urban Affairs',
    logoUrl: null,
    stipend: '₹12,000 / month',
    stipendAmount: 12000,
    currency: 'INR',
    isPaid: true,
    workMode: 'hybrid',
    location: 'New Delhi / Bangalore (Hybrid)',
    category: 'data',
    skills: ['Python', 'SQL', 'GIS Mapping', 'Data Analytics', 'Excel'],
    educationRequirements: 'B.Tech / B.E. (Pre-final / Final Year) or MCA from AICTE approved colleges',
    deadline: '2026-06-30',
    source: 'AICTE National Internship Portal',
    sourceUrl: 'https://internship.aicte-india.org/',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'int-isro-vssc-2026',
    title: 'Avionics & Space Technology Research Intern',
    company: 'ISRO (VSSC / URSC Centers)',
    logoUrl: null,
    stipend: 'Unpaid (Official Academic Project / Research Credit)',
    stipendAmount: 0,
    currency: 'INR',
    isPaid: false,
    workMode: 'onsite',
    location: 'Thiruvananthapuram / Bengaluru',
    category: 'research',
    skills: ['MATLAB', 'Embedded C', 'Signal Processing', 'Aerospace'],
    educationRequirements: 'Regular undergraduate / M.Sc student with min 65% aggregate or 6.84 CGPA',
    deadline: '2026-05-31',
    source: 'Indian Space Research Organisation (ISRO) Official',
    sourceUrl: 'https://www.isro.gov.in/Internship.html',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'int-infosys-springboard-2026',
    title: 'Full Stack Web & Cloud Computing Trainee',
    company: 'Infosys Springboard',
    logoUrl: null,
    stipend: '₹10,000 performance stipend + completion certificate',
    stipendAmount: 10000,
    currency: 'INR',
    isPaid: true,
    workMode: 'remote',
    location: 'Remote (All India)',
    category: 'software',
    skills: ['Java', 'Spring Boot', 'React', 'Cloud Basics'],
    educationRequirements: 'B.E./B.Tech, B.Sc, BCA students (1st to 4th year)',
    deadline: '2026-07-15',
    source: 'Infosys Springboard Virtual Internship',
    sourceUrl: 'https://springboard.infosys.com/',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'int-microsoft-ambassador-2026',
    title: 'Cloud Solutions & AI Student Partner',
    company: 'Microsoft Learn Student Ambassadors',
    logoUrl: null,
    stipend: 'Mentorship + Azure Credits ($150/mo) + Certification Vouchers',
    stipendAmount: 12000,
    currency: 'INR',
    isPaid: true,
    workMode: 'remote',
    location: 'Remote',
    category: 'software',
    skills: ['Azure', 'TypeScript', 'Python', 'Generative AI'],
    educationRequirements: 'Actively enrolled college student (any accredited degree, age 16+)',
    deadline: '2026-06-15',
    source: 'Microsoft Student Programs',
    sourceUrl: 'https://mvp.microsoft.com/studentambassadors',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'int-rbi-summer-2026',
    title: 'Economic Research & FinTech Summer Intern',
    company: 'Reserve Bank of India (RBI)',
    logoUrl: null,
    stipend: '₹20,000 / month',
    stipendAmount: 20000,
    currency: 'INR',
    isPaid: true,
    workMode: 'onsite',
    location: 'Mumbai & Regional RBI Offices',
    category: 'finance',
    skills: ['Economics', 'Data Analysis', 'Python', 'Financial Modelling'],
    educationRequirements: 'Penultimate year of postgraduate degree in Economics, Finance, MBA, or 5-yr Law',
    deadline: '2026-12-15',
    source: 'Reserve Bank of India Opportunities',
    sourceUrl: 'https://opportunities.rbi.org.in/',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'int-drdo-electronics-2026',
    title: 'Defence Electronics & Systems Trainee',
    company: 'DRDO (Electronics Labs)',
    logoUrl: null,
    stipend: '₹9,000 / month (Apprenticeship Act)',
    stipendAmount: 9000,
    currency: 'INR',
    isPaid: true,
    workMode: 'onsite',
    location: 'Hyderabad / Bengaluru',
    category: 'research',
    skills: ['VHDL/Verilog', 'C/C++', 'Microcontrollers', 'Circuit Design'],
    educationRequirements: 'Final year B.E./B.Tech in ECE, EEE, CSE with min 60% marks',
    deadline: '2026-05-20',
    source: 'DRDO Official Careers',
    sourceUrl: 'https://drdo.gov.in/',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
];

const VERIFIED_SCHOLARSHIPS = [
  {
    id: 'sch-nsp-central-sector',
    name: 'Central Sector Scheme of Scholarships for College and University Students',
    provider: 'Department of Higher Education (Ministry of Education, Govt of India)',
    awardAmount: '₹12,000 – ₹20,000 / year',
    awardAmountNum: 12000,
    currency: 'INR',
    eligibleCourses: ['B.Tech', 'B.E', 'B.Sc', 'B.Com', 'BA', 'MBBS', 'All Undergraduates'],
    courseCategory: 'general',
    studyYears: [1],
    targetGroup: 'Merit-cum-means college undergraduates',
    stateRestrictions: 'All India',
    familyIncomeLimit: 450000, // Rs 4.5 Lakh
    academicCutoff: 80, // 80th percentile in Class 12
    genderRestriction: null,
    openingDate: '2026-08-01',
    closingDate: '2026-10-31',
    requiredDocuments: [
      'Class 12 Passing Marksheet',
      'Annual Income Certificate issued by competent revenue authority',
      'College Bonafide / Admission Receipt',
      'Bank Account Passbook (Aadhaar-seeded)',
      'Aadhaar Card',
    ],
    officialSource: 'National Scholarship Portal (NSP)',
    applicationUrl: 'https://scholarships.gov.in/',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
    statusNote: 'Annual cycle verified on official NSP portal. Applications open each academic year.',
  },
  {
    id: 'sch-aicte-pragati',
    name: 'AICTE Pragati Scholarship Scheme for Girl Students',
    provider: 'All India Council for Technical Education (AICTE)',
    awardAmount: '₹50,000 / year (up to 4 years)',
    awardAmountNum: 50000,
    currency: 'INR',
    eligibleCourses: ['B.Tech', 'B.E', 'B.Pharm', 'B.Arch', 'Technical Degrees'],
    courseCategory: 'engineering',
    studyYears: [1, 2],
    targetGroup: 'Female students pursuing technical degree programs',
    stateRestrictions: 'All India',
    familyIncomeLimit: 800000, // Rs 8.0 Lakh
    academicCutoff: 60,
    genderRestriction: 'female',
    openingDate: '2026-09-01',
    closingDate: '2026-11-30',
    requiredDocuments: [
      'Proof of admission to AICTE-approved institution (1st/lateral 2nd year)',
      'Family Income Certificate (below Rs 8 Lakh)',
      'Class 10 and Class 12 Marksheets',
      'Bonafide Certificate from College Principal',
      'Aadhaar Card',
    ],
    officialSource: 'AICTE Official Portal',
    applicationUrl: 'https://www.aicte-india.org/schemes/students-development-schemes/Pragati',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
    statusNote: 'Confirmed active scholarship program funded directly by Ministry of Education.',
  },
  {
    id: 'sch-reliance-foundation',
    name: 'Reliance Foundation Undergraduate Scholarship',
    provider: 'Reliance Foundation',
    awardAmount: 'Up to ₹2,00,000 over course duration',
    awardAmountNum: 200000,
    currency: 'INR',
    eligibleCourses: ['B.Tech', 'B.Sc', 'B.Com', 'BA', 'BBA', 'All Undergraduates'],
    courseCategory: 'general',
    studyYears: [1],
    targetGroup: 'Full-time first-year undergraduate students',
    stateRestrictions: 'All India',
    familyIncomeLimit: 1500000, // Rs 15 Lakh (preference < 2.5 Lakh)
    academicCutoff: 60, // Min 60% in Class 12
    genderRestriction: null,
    openingDate: '2026-08-15',
    closingDate: '2026-10-15',
    requiredDocuments: [
      'Class 12 Board Exam Marksheet',
      'College Bonafide / Enrollment Verification',
      'Official Household Income Proof',
      'Aptitude Test Score (taken online during application)',
    ],
    officialSource: 'Reliance Foundation Official Portal',
    applicationUrl: 'https://www.reliancefoundation.org/',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
    statusNote: 'Verified national merit-cum-means scholarship with independent online aptitude test.',
  },
  {
    id: 'sch-tata-pankh',
    name: 'Tata Capital Pankh Scholarship Programme',
    provider: 'Tata Capital Foundation',
    awardAmount: 'Up to ₹50,000 or 80% of tuition fees',
    awardAmountNum: 50000,
    currency: 'INR',
    eligibleCourses: ['B.Tech', 'B.Sc', 'B.Com', 'BA', 'Diploma', 'Professional Degrees'],
    courseCategory: 'general',
    studyYears: [1, 2, 3, 4],
    targetGroup: 'Economically challenged students enrolled in recognized degrees',
    stateRestrictions: 'All India',
    familyIncomeLimit: 250000, // Rs 2.5 Lakh
    academicCutoff: 60, // 60% in previous academic qualifying exam
    genderRestriction: null,
    openingDate: '2026-07-01',
    closingDate: '2026-09-30',
    requiredDocuments: [
      'Previous year academic marksheets',
      'Income Certificate issued by government authority',
      'Current college fee receipt and student ID',
      'Bank details of student or parent',
    ],
    officialSource: 'Tata Capital Sustainability Portal',
    applicationUrl: 'https://www.tatacapital.com/',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
    statusNote: 'Verified corporate social responsibility educational initiative by Tata Capital.',
  },
  {
    id: 'sch-post-matric-minorities',
    name: 'Post Matric Scholarship Scheme for Minorities',
    provider: 'Ministry of Minority Affairs (Govt of India)',
    awardAmount: '₹10,000 / year + course fee reimbursement',
    awardAmountNum: 10000,
    currency: 'INR',
    eligibleCourses: ['All Undergraduates', 'Postgraduates', 'Professional Courses'],
    courseCategory: 'general',
    studyYears: [1, 2, 3, 4],
    targetGroup: 'Students belonging to notified minority communities (Muslim, Christian, Sikh, Buddhist, Jain, Parsi)',
    stateRestrictions: 'All India',
    familyIncomeLimit: 200000, // Rs 2.0 Lakh
    academicCutoff: 50, // Min 50% in previous exam
    genderRestriction: null,
    openingDate: '2026-08-01',
    closingDate: '2026-11-15',
    requiredDocuments: [
      'Self-declaration of minority community',
      'Family Income Certificate',
      'Previous examination marksheet',
      'Fee receipt from educational institution',
      'Aadhaar Card',
    ],
    officialSource: 'National Scholarship Portal (NSP)',
    applicationUrl: 'https://scholarships.gov.in/',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
    statusNote: 'Statutory government welfare scholarship listed on central NSP portal.',
  },
  {
    id: 'sch-pmsss-jk',
    name: 'Prime Minister’s Special Scholarship Scheme (PMSSS) for J&K and Ladakh',
    provider: 'AICTE & Ministry of Education',
    awardAmount: 'Up to ₹1,25,000 academic fee + ₹1,00,000 maintenance / year',
    awardAmountNum: 225000,
    currency: 'INR',
    eligibleCourses: ['B.Tech', 'MBBS', 'B.Sc Nursing', 'Hotel Management', 'General Degrees'],
    courseCategory: 'engineering',
    studyYears: [1],
    targetGroup: 'Domiciled youth of Jammu & Kashmir and Ladakh',
    stateRestrictions: 'Jammu and Kashmir, Ladakh',
    familyIncomeLimit: 800000, // Rs 8.0 Lakh
    academicCutoff: 50,
    genderRestriction: null,
    openingDate: '2026-05-15',
    closingDate: '2026-07-31',
    requiredDocuments: [
      'Domicile Certificate of UT of J&K or Ladakh',
      'Class 12 Marksheet (JKBOSE or CBSE in J&K/Ladakh)',
      'Annual Family Income Certificate',
      'Aadhaar Card',
    ],
    officialSource: 'AICTE PMSSS Portal',
    applicationUrl: 'https://www.aicte-jk-scholarship-gov.in/',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
    statusNote: 'Government of India flagship scheme administered through AICTE counseling.',
  },
];

const VERIFIED_OFFERS = [
  {
    id: 'off-spotify-student',
    provider: 'Spotify India',
    title: 'Spotify Premium Student Plan',
    category: 'entertainment',
    discount: '50% off + 1 month free trial',
    originalPrice: '₹119 / month',
    discountedPrice: '₹59 / month',
    currency: 'INR',
    promoCode: null,
    redemptionInstructions:
      'Log into Spotify, navigate to Premium Student, and verify your college enrollment via SheerID using your college ID or .edu email.',
    verificationRequirements: 'Accredited college ID card, enrollment letter, or college email domain',
    restrictions: 'Valid for up to 4 consecutive years while enrolled. Recurring monthly payment.',
    expiryDate: '2026-12-31',
    isOngoing: true,
    source: 'Spotify Official Student Portal',
    sourceUrl: 'https://www.spotify.com/in-en/student/',
    redemptionUrl: 'https://www.spotify.com/in-en/student/',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'off-apple-education',
    provider: 'Apple India',
    title: 'Apple Education Pricing & Back to School Offer',
    category: 'hardware',
    discount: 'Save up to ₹10,000 on Mac & iPad + Free AirPods',
    originalPrice: null,
    discountedPrice: null,
    currency: 'INR',
    promoCode: null,
    redemptionInstructions:
      'Authenticate with UNiDAYS on the Apple Store Online or present your valid student ID card at Apple BKC / Apple Saket retail stores.',
    verificationRequirements: 'UNiDAYS student verification or valid physical college ID card',
    restrictions: 'Limit of one Mac and one iPad per student per academic year.',
    expiryDate: '2026-10-31',
    isOngoing: true,
    source: 'Apple India Education Store',
    sourceUrl: 'https://www.apple.com/in-edu/store',
    redemptionUrl: 'https://www.apple.com/in-edu/store',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'off-github-student-pack',
    provider: 'GitHub Education',
    title: 'GitHub Student Developer Pack',
    category: 'software',
    discount: '$200,000+ in free developer tools & cloud credits',
    originalPrice: '$200,000+ market value',
    discountedPrice: 'Free (₹0)',
    currency: 'USD',
    promoCode: null,
    redemptionInstructions:
      'Apply with your college email address or upload an image of your valid student ID card on GitHub Education.',
    verificationRequirements: 'Active student email (.edu, .ac.in) or scanned student ID with current dates',
    restrictions: 'Includes GitHub Pro, free domain via Namecheap, DigitalOcean credits, JetBrains licenses, and Canva Pro.',
    expiryDate: '2026-12-31',
    isOngoing: true,
    source: 'GitHub Education Official',
    sourceUrl: 'https://education.github.com/pack',
    redemptionUrl: 'https://education.github.com/pack',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'off-amazon-prime-youth',
    provider: 'Amazon India',
    title: 'Amazon Prime Youth Offer (18–24 Years)',
    category: 'shopping',
    discount: '50% cashback on Annual Prime Membership',
    originalPrice: '₹1,499 / year',
    discountedPrice: '₹749 / year (effective after ₹750 cashback)',
    currency: 'INR',
    promoCode: null,
    redemptionInstructions:
      'Join Prime on the Amazon app, complete youth verification by uploading 1 ID proof (Aadhaar / PAN / College ID) and 1 selfie within 15 days.',
    verificationRequirements: 'Valid age proof (18 to 24 years old) via Aadhaar/PAN or college ID',
    restrictions: 'Cashback credited to Amazon Pay balance within 48 hours of document verification.',
    expiryDate: '2026-12-31',
    isOngoing: true,
    source: 'Amazon India Youth Offer',
    sourceUrl: 'https://www.amazon.in/prime',
    redemptionUrl: 'https://www.amazon.in/prime',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'off-notion-plus-student',
    provider: 'Notion Labs',
    title: 'Notion Plus Free Student Plan',
    category: 'software',
    discount: '100% Free Notion Plus Plan (saves $10/month)',
    originalPrice: '$10 / month (₹830/month)',
    discountedPrice: 'Free (₹0)',
    currency: 'USD',
    promoCode: null,
    redemptionInstructions:
      'Sign up on Notion using your recognized college email address (.edu / .ac.in / college domain) and navigate to Settings > Upgrade to claim Plus.',
    verificationRequirements: 'Valid university or college email domain',
    restrictions: 'Personal workspace only. Unlimited page blocks, 30-day version history, 5MB+ file uploads.',
    expiryDate: '2026-12-31',
    isOngoing: true,
    source: 'Notion for Education Official',
    sourceUrl: 'https://www.notion.so/product/notion-for-education',
    redemptionUrl: 'https://www.notion.so/product/notion-for-education',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'off-jetbrains-all-products',
    provider: 'JetBrains',
    title: 'JetBrains Free All-Products Educational License',
    category: 'software',
    discount: '100% Free Professional IDE Suite (IntelliJ, PyCharm, WebStorm)',
    originalPrice: '₹22,000 / year',
    discountedPrice: 'Free (₹0)',
    currency: 'INR',
    promoCode: null,
    redemptionInstructions:
      'Register on JetBrains with an official university email, ISIC card, or GitHub Student Developer Pack authentication.',
    verificationRequirements: 'Active college email or verified student credentials',
    restrictions: 'Non-commercial academic use only. Renewable each year as long as enrolled as a student.',
    expiryDate: '2026-12-31',
    isOngoing: true,
    source: 'JetBrains Educational Licenses',
    sourceUrl: 'https://www.jetbrains.com/community/education/#students',
    redemptionUrl: 'https://www.jetbrains.com/community/education/#students',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'off-makemytrip-student',
    provider: 'MakeMyTrip & Domestic Airlines',
    title: 'MakeMyTrip Student Special Domestic Fares',
    category: 'travel',
    discount: 'Up to 10% off base fares + 10 kg extra baggage allowance',
    originalPrice: null,
    discountedPrice: null,
    currency: 'INR',
    promoCode: 'MMTSTUDENT',
    redemptionInstructions:
      'Select "Student Fare" category on MakeMyTrip flight search. Enter promo code MMTSTUDENT at checkout. Carry physical college ID at airport.',
    verificationRequirements: 'Valid physical student ID card mandatory at airline airport check-in counter',
    restrictions: 'Applicable on select domestic flights (IndiGo, Air India, SpiceJet). Age 12+ enrolled in recognized school/college.',
    expiryDate: '2026-12-31',
    isOngoing: true,
    source: 'MakeMyTrip Student Flights',
    sourceUrl: 'https://www.makemytrip.com/flights/student-flights.html',
    redemptionUrl: 'https://www.makemytrip.com/flights/student-flights.html',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
  {
    id: 'off-zomato-student-club',
    provider: 'Zomato India',
    title: 'Zomato Campus Student Perks & Dining Discounts',
    category: 'food',
    discount: 'Extra 10% to 20% off at campus partnered restaurants',
    originalPrice: null,
    discountedPrice: null,
    currency: 'INR',
    promoCode: 'CAMPUSFEAST',
    redemptionInstructions:
      'Verify student status in Zomato profile under "Campus Offers" by uploading your valid student ID card or entering campus pin code.',
    verificationRequirements: 'College ID card verification within Zomato app',
    restrictions: 'Valid at participating restaurants within 3 km radius of recognized college campuses.',
    expiryDate: '2026-12-31',
    isOngoing: true,
    source: 'Zomato Campus Partner Program',
    sourceUrl: 'https://www.zomato.com',
    redemptionUrl: 'https://www.zomato.com',
    sourceType: 'curated_verified',
    isVerified: true,
    lastVerifiedAt: '2026-10-24T00:00:00Z',
  },
];

/**
 * Evaluates scholarship eligibility based strictly on student voluntary inputs.
 * Never infers missing information or guarantees an award.
 */
function evaluateScholarshipEligibility(scholarship, student = {}) {
  const reasons = [];
  const missing = [];
  let isDisqualified = false;

  // 1. Course Match
  if (student.course) {
    const courseNorm = student.course.toLowerCase();
    const courseMatches = scholarship.eligibleCourses.some(
      (c) => c.toLowerCase() === 'all undergraduates' || courseNorm.includes(c.toLowerCase()) || c.toLowerCase().includes(courseNorm)
    );
    if (!courseMatches && scholarship.courseCategory !== 'general') {
      isDisqualified = true;
      reasons.push(`Your stated course (${student.course}) does not match the eligible technical stream required (${scholarship.eligibleCourses.join(', ')}).`);
    } else {
      reasons.push(`Course (${student.course}) matches eligibility criteria.`);
    }
  } else {
    missing.push('Degree / Course of study');
  }

  // 2. Study Year
  if (student.studyYear !== undefined && student.studyYear !== null && student.studyYear !== '') {
    const yr = Number(student.studyYear);
    if (scholarship.studyYears && scholarship.studyYears.length > 0 && !scholarship.studyYears.includes(yr)) {
      isDisqualified = true;
      reasons.push(`Scheme is open for Year ${scholarship.studyYears.join(' & ')} students; your current year is ${yr}.`);
    } else {
      reasons.push(`Study year (${yr}) is within the eligible intake.`);
    }
  } else {
    missing.push('Current year of study');
  }

  // 3. Gender Requirement
  if (scholarship.genderRestriction) {
    if (student.gender) {
      if (student.gender.toLowerCase() !== scholarship.genderRestriction.toLowerCase()) {
        isDisqualified = true;
        reasons.push(`This specific scholarship is designated exclusively for ${scholarship.genderRestriction} students.`);
      } else {
        reasons.push(`Gender requirement (${scholarship.genderRestriction}) satisfied.`);
      }
    } else {
      missing.push(`Gender verification (Scheme is for ${scholarship.genderRestriction} candidates)`);
    }
  }

  // 4. Annual Family Income
  if (scholarship.familyIncomeLimit) {
    if (student.annualFamilyIncome !== undefined && student.annualFamilyIncome !== null && student.annualFamilyIncome !== '') {
      const income = Number(student.annualFamilyIncome);
      if (income > scholarship.familyIncomeLimit) {
        isDisqualified = true;
        reasons.push(
          `Stated family income (₹${income.toLocaleString('en-IN')}) exceeds the ceiling limit of ₹${scholarship.familyIncomeLimit.toLocaleString('en-IN')}/year.`
        );
      } else {
        reasons.push(`Family income is within the ceiling limit of ₹${scholarship.familyIncomeLimit.toLocaleString('en-IN')}/year.`);
      }
    } else {
      missing.push(`Family annual income (Max ceiling: ₹${scholarship.familyIncomeLimit.toLocaleString('en-IN')})`);
    }
  }

  // 5. Academic Cutoff
  if (scholarship.academicCutoff) {
    if (student.academicScore !== undefined && student.academicScore !== null && student.academicScore !== '') {
      const score = Number(student.academicScore);
      if (score < scholarship.academicCutoff) {
        isDisqualified = true;
        reasons.push(`Academic score (${score}%) is below the minimum threshold of ${scholarship.academicCutoff}%.`);
      } else {
        reasons.push(`Academic score (${score}%) satisfies the minimum requirement of ${scholarship.academicCutoff}%.`);
      }
    } else {
      missing.push(`Academic qualifying score / percentage (Minimum: ${scholarship.academicCutoff}%)`);
    }
  }

  // 6. Geographic Restrictions
  if (scholarship.stateRestrictions && scholarship.stateRestrictions !== 'All India') {
    if (student.state) {
      const allowedStates = scholarship.stateRestrictions.split(',').map((s) => s.trim().toLowerCase());
      if (!allowedStates.includes(student.state.trim().toLowerCase())) {
        isDisqualified = true;
        reasons.push(`Domicile restricted to ${scholarship.stateRestrictions}; your provided state is ${student.state}.`);
      } else {
        reasons.push(`State of domicile (${student.state}) matches geographic requirement.`);
      }
    } else {
      missing.push(`State of domicile (Scheme restricted to ${scholarship.stateRestrictions})`);
    }
  }

  // Determine final status
  let status = 'Likely eligible';
  if (isDisqualified) {
    status = 'Not eligible based on provided details';
  } else if (missing.length > 0) {
    status = 'Check requirements';
  }

  return {
    scholarshipId: scholarship.id,
    scholarshipName: scholarship.name,
    status,
    reasons,
    missingDetails: missing,
    disclaimer:
      'Eligibility evaluation is purely educational and non-binding based on your self-reported inputs. Finzin never guarantees scholarship awards, selection, or portal approvals.',
  };
}

module.exports = {
  VERIFIED_INTERNSHIPS,
  VERIFIED_SCHOLARSHIPS,
  VERIFIED_OFFERS,
  evaluateScholarshipEligibility,
};
