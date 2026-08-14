import dns from 'dns/promises';

export interface DnsVerificationResult {
  verified: boolean;
  mxFound: boolean;
  txtFound: boolean;
  message: string;
  details: {
    mxRecords: string[];
    txtRecords: string[];
  };
}

export async function verifyDomainDns(
  domainName: string,
  verificationToken: string
): Promise<DnsVerificationResult> {
  const details = {
    mxRecords: [] as string[],
    txtRecords: [] as string[],
  };

  let mxFound = false;
  let txtFound = false;

  try {
    const mxList = await dns.resolveMx(domainName);
    details.mxRecords = mxList.map((m) => `${m.priority} ${m.exchange}`);
    if (mxList.length > 0) {
      mxFound = true;
    }
  } catch (error) {
    // MX lookup error or no MX records
  }

  try {
    const txtList = await dns.resolveTxt(domainName);
    const flattenedTxt = txtList.flat();
    details.txtRecords = flattenedTxt;

    const expectedTokenString = `riellmail-verify=${verificationToken}`;
    txtFound = flattenedTxt.some((txt) => txt.includes(expectedTokenString) || txt.includes(verificationToken));
  } catch (error) {
    // TXT lookup error
  }

  const verified = mxFound || txtFound; // Verified if at least MX is configured or TXT match
  let message = 'Domain DNS verification completed successfully.';

  if (!verified) {
    message = 'DNS records not detected. Please ensure MX or TXT verification records are set in your DNS provider.';
  } else if (mxFound && !txtFound) {
    message = 'MX record detected. Domain verified successfully.';
  } else if (txtFound && !mxFound) {
    message = 'TXT verification record matched. Remember to set your MX record for incoming mail routing.';
  }

  return {
    verified,
    mxFound,
    txtFound,
    message,
    details,
  };
}
