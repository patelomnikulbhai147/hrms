export interface Country {
  name: string;
  code: string;
  dialCode: string;
  flag: string;
  minLength: number;
  maxLength: number;
  placeholder: string;
}

export const countries: Country[] = [
  { name: 'India', code: 'IN', dialCode: '+91', flag: '🇮🇳', minLength: 10, maxLength: 10, placeholder: '98765 43210' },
  { name: 'United States', code: 'US', dialCode: '+1', flag: '🇺🇸', minLength: 10, maxLength: 10, placeholder: '201 555 0123' },
  { name: 'United Kingdom', code: 'GB', dialCode: '+44', flag: '🇬🇧', minLength: 10, maxLength: 11, placeholder: '7911 123456' },
  { name: 'Canada', code: 'CA', dialCode: '+1', flag: '🇨🇦', minLength: 10, maxLength: 10, placeholder: '416 555 0199' },
  { name: 'Australia', code: 'AU', dialCode: '+61', flag: '🇦🇺', minLength: 9, maxLength: 9, placeholder: '412 345 678' },
  { name: 'Germany', code: 'DE', dialCode: '+49', flag: '🇩🇪', minLength: 10, maxLength: 11, placeholder: '151 23456789' },
  { name: 'France', code: 'FR', dialCode: '+33', flag: '🇫🇷', minLength: 9, maxLength: 9, placeholder: '6 12 34 56 78' },
  { name: 'Singapore', code: 'SG', dialCode: '+65', flag: '🇸🇬', minLength: 8, maxLength: 8, placeholder: '8123 4567' },
  { name: 'United Arab Emirates', code: 'AE', dialCode: '+971', flag: '🇦🇪', minLength: 9, maxLength: 9, placeholder: '50 123 4567' },
  { name: 'Indonesia', code: 'ID', dialCode: '+62', flag: '🇮🇩', minLength: 9, maxLength: 12, placeholder: '812 3456 7890' },
  { name: 'Japan', code: 'JP', dialCode: '+81', flag: '🇯🇵', minLength: 10, maxLength: 10, placeholder: '90 1234 5678' },
  { name: 'Netherlands', code: 'NL', dialCode: '+31', flag: '🇳🇱', minLength: 9, maxLength: 9, placeholder: '6 12345678' },
  { name: 'Switzerland', code: 'CH', dialCode: '+41', flag: '🇨🇭', minLength: 9, maxLength: 9, placeholder: '79 123 45 67' },
  { name: 'South Africa', code: 'ZA', dialCode: '+27', flag: '🇿🇦', minLength: 9, maxLength: 9, placeholder: '83 123 4567' },
  { name: 'New Zealand', code: 'NZ', dialCode: '+64', flag: '🇳🇿', minLength: 8, maxLength: 10, placeholder: '21 123 4567' },
  { name: 'Malaysia', code: 'MY', dialCode: '+60', flag: '🇲🇾', minLength: 9, maxLength: 10, placeholder: '12 345 6789' },
  { name: 'Brazil', code: 'BR', dialCode: '+55', flag: '🇧🇷', minLength: 10, maxLength: 11, placeholder: '11 91234 5678' },
  { name: 'Saudi Arabia', code: 'SA', dialCode: '+966', flag: '🇸🇦', minLength: 9, maxLength: 9, placeholder: '50 123 4567' },
  { name: 'Spain', code: 'ES', dialCode: '+34', flag: '🇪🇸', minLength: 9, maxLength: 9, placeholder: '612 345 678' },
  { name: 'Italy', code: 'IT', dialCode: '+39', flag: '🇮🇹', minLength: 10, maxLength: 10, placeholder: '312 345 6789' },
  { name: 'Sweden', code: 'SE', dialCode: '+46', flag: '🇸🇪', minLength: 9, maxLength: 9, placeholder: '70 123 45 67' },
  { name: 'Norway', code: 'NO', dialCode: '+47', flag: '🇳🇴', minLength: 8, maxLength: 8, placeholder: '912 34 567' },
  { name: 'Denmark', code: 'DK', dialCode: '+45', flag: '🇩🇰', minLength: 8, maxLength: 8, placeholder: '20 12 34 56' },
  { name: 'Ireland', code: 'IE', dialCode: '+353', flag: '🇮🇪', minLength: 9, maxLength: 9, placeholder: '85 123 4567' },
  { name: 'Mexico', code: 'MX', dialCode: '+52', flag: '🇲🇽', minLength: 10, maxLength: 10, placeholder: '55 1234 5678' }
];

// List of pinned favorite countries to display at the very top of the dropdown list
export const favoriteCountryCodes = ['IN', 'US', 'GB', 'CA', 'AU'];

// ── Nationality country master ───────────────────────────────────────────────
// Full list of internationally recognized countries for the Employee "Nationality"
// field (searchable dropdown). India is the default and is listed first; the rest
// are alphabetical. Custom countries (Super Admin only) are appended at runtime
// from the Country master and merged with this list.
export const DEFAULT_COUNTRY = 'India';

export const NATIONALITY_COUNTRIES: string[] = [
  'India',
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina',
  'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados',
  'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana',
  'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia', 'Cameroon',
  'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo (Brazzaville)',
  'Congo (Kinshasa)', 'Costa Rica', "Côte d'Ivoire", 'Croatia', 'Cuba', 'Cyprus', 'Czechia', 'Denmark',
  'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea',
  'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia',
  'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti',
  'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
  'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Laos',
  'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Macao',
  'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania',
  'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique',
  'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria',
  'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama',
  'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia',
  'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino',
  'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore',
  'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain',
  'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania',
  'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan',
  'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay',
  'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
];
