export {
  ChangeResourceRecordSets,
  type ChangeResourceRecordSetsRequest,
} from "./ChangeResourceRecordSets.ts";
export { ChangeResourceRecordSetsHttp } from "./ChangeResourceRecordSetsHttp.ts";
export { GetChange } from "./GetChange.ts";
export { GetChangeHttp } from "./GetChangeHttp.ts";
export { GetHealthCheckLastFailureReason } from "./GetHealthCheckLastFailureReason.ts";
export { GetHealthCheckLastFailureReasonHttp } from "./GetHealthCheckLastFailureReasonHttp.ts";
export { GetHealthCheckStatus } from "./GetHealthCheckStatus.ts";
export { GetHealthCheckStatusHttp } from "./GetHealthCheckStatusHttp.ts";
export { GetHostedZone } from "./GetHostedZone.ts";
export { GetHostedZoneHttp } from "./GetHostedZoneHttp.ts";
export { HealthCheck, HealthCheckProvider } from "./HealthCheck.ts";
export { HostedZone, HostedZoneProvider } from "./HostedZone.ts";
export { ListHostedZones } from "./ListHostedZones.ts";
export { ListHostedZonesByName } from "./ListHostedZonesByName.ts";
export { ListHostedZonesByNameHttp } from "./ListHostedZonesByNameHttp.ts";
export { ListHostedZonesByVPC } from "./ListHostedZonesByVPC.ts";
export { ListHostedZonesByVPCHttp } from "./ListHostedZonesByVPCHttp.ts";
export { ListHostedZonesHttp } from "./ListHostedZonesHttp.ts";
export {
  ListResourceRecordSets,
  type ListResourceRecordSetsRequest,
} from "./ListResourceRecordSets.ts";
export { ListResourceRecordSetsHttp } from "./ListResourceRecordSetsHttp.ts";
export {
  QueryLoggingConfig,
  QueryLoggingConfigProvider,
} from "./QueryLoggingConfig.ts";
export { Record, RecordProvider } from "./Record.ts";
export { Records, RecordsProvider, type RecordsBinding } from "./Records.ts";
export {
  dns,
  route53Dns,
  route53DnsFrom,
  route53DnsAdapter,
  route53Zone,
  Route53DNSAdapter,
  Route53Zone,
  type Route53ZoneLookup,
  type Route53ZoneIdentity,
} from "./Adapter.ts";
export {
  AmbiguousHostedZone,
  findPublicHostedZone,
  findPublicHostedZoneFrom,
  findPublicHostedZoneId,
  findPublicHostedZoneIdFrom,
  hostedZoneNameCandidates,
  normalizeHostedZoneName,
  resolveHostedZoneId,
  type HostedZoneListByName,
  type PublicHostedZone,
} from "./HostedZoneLookup.ts";
export { TestDNSAnswer, type TestDNSAnswerRequest } from "./TestDNSAnswer.ts";
export { TestDNSAnswerHttp } from "./TestDNSAnswerHttp.ts";
export {
  VpcAssociationAuthorization,
  VpcAssociationAuthorizationProvider,
} from "./VpcAssociationAuthorization.ts";
export {
  ZoneVpcAssociation,
  ZoneVpcAssociationProvider,
} from "./ZoneVpcAssociation.ts";
// NOTE: BindingHttp.ts is shared scaffolding and intentionally NOT exported.
