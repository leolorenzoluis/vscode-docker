/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SubscriptionClient, SubscriptionModels } from 'azure-arm-resource';
import { ServiceClientCredentials } from 'ms-rest';
import { AzureEnvironment } from 'ms-rest-azure';
import { Disposable, Extension, ExtensionContext, extensions } from 'vscode';
import { AzureAccount, AzureLoginStatus, AzureSession } from '../../typings/azure-account.api';

import { Subscription } from 'azure-arm-resource/lib/subscription/models';
import { getSubscriptionId, getTenantId, nonNullValue } from '../../utils/nonNull';
import * as util from './util';

export class NotSignedInError extends Error { }

export class CredentialError extends Error { }

export class AzureAccountWrapper {
    public readonly accountApi: AzureAccount;

    constructor(readonly extensionConext: ExtensionContext, azureAccount: AzureAccount) {
        this.accountApi = azureAccount;
    }

    public getAzureSessions(): AzureSession[] {
        const status = this.signInStatus;
        if (status !== 'LoggedIn') {
            throw new NotSignedInError(status)
        }
        return this.accountApi.sessions;
    }

    public getCredentialByTenantId(tenantIdOrSubscription: string | Subscription): ServiceClientCredentials {
        let tenantId = typeof tenantIdOrSubscription === 'string' ? tenantIdOrSubscription : getTenantId(tenantIdOrSubscription);
        const session = this.getAzureSessions().find((s, i, array) => s.tenantId.toLowerCase() === tenantId.toLowerCase());

        if (session) {
            return session.credentials;
        }

        throw new CredentialError(`Failed to get credential, tenant ${tenantId} not found.`);
    }

    get signInStatus(): AzureLoginStatus {
        return this.accountApi.status;
    }

    public getFilteredSubscriptions(): SubscriptionModels.Subscription[] {
        return this.accountApi.filters.map<SubscriptionModels.Subscription>(filter => {
            return {
                id: filter.subscription.id,
                subscriptionId: filter.subscription.subscriptionId,
                tenantId: filter.session.tenantId,
                displayName: filter.subscription.displayName,
                state: filter.subscription.state,
                subscriptionPolicies: filter.subscription.subscriptionPolicies,
                authorizationSource: filter.subscription.authorizationSource
            };
        });
    }

    public async getAllSubscriptions(): Promise<SubscriptionModels.Subscription[]> {
        return this.accountApi.subscriptions.map(({ session, subscription }) => ({ tenantId: session.tenantId, ...subscription }));
    }

    public async getLocationsBySubscription(subscription: SubscriptionModels.Subscription): Promise<SubscriptionModels.Location[]> {
        const credential = this.getCredentialByTenantId(subscription);
        const client = new SubscriptionClient(credential);
        const locations = <SubscriptionModels.Location[]>(await client.subscriptions.listLocations(getSubscriptionId(subscription)));
        return locations;
    }

    // tslint:disable-next-line:no-any
    public registerSessionsChangedListener(listener: (e: void) => any, thisArg: any): Disposable {
        return this.accountApi.onSessionsChanged(listener, thisArg, this.extensionConext.subscriptions);
    }

    // tslint:disable-next-line:no-any
    public registerFiltersChangedListener(listener: (e: void) => any, thisArg: any): Disposable {
        return this.accountApi.onFiltersChanged(listener, thisArg, this.extensionConext.subscriptions);
    }
}
