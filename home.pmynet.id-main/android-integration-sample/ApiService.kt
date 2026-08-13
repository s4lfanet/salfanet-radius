package com.example.billingapi

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST

// =========================
// Request / Response Models
// =========================

data class LoginRequest(
    val username: String,
    val password: String
)

data class LoginResponse(
    val token: String,
    val user: UserInfo?
)

data class UserInfo(
    val id: Int,
    val username: String,
    val role: String,
    val fullname: String?
)

data class PortalLoginRequest(
    val phone: String,
    val pin: String
)

data class PortalLoginResponse(
    val token: String,
    val customer: CustomerInfo
)

data class CustomerInfo(
    val username: String,
    val fullname: String?,
    val phone: String?,
    val address: String?
)

data class PortalMeResponse(
    val username: String,
    val fullname: String?,
    val phone: String?,
    val address: String?
)

data class InvoiceItem(
    val id: Int,
    val username: String,
    val period: String,
    val amount: Double,
    val status: String
)

// =========================
// Retrofit API Interface
// =========================

interface ApiService {

    @POST("auth/login")
    suspend fun login(
        @Body request: LoginRequest
    ): Response<LoginResponse>

    @POST("portal/login")
    suspend fun portalLogin(
        @Body request: PortalLoginRequest
    ): Response<PortalLoginResponse>

    @GET("portal/me")
    suspend fun getPortalMe(
        @Header("Authorization") token: String
    ): Response<PortalMeResponse>

    @GET("portal/invoices")
    suspend fun getPortalInvoices(
        @Header("Authorization") token: String
    ): Response<List<InvoiceItem>>

    @GET("portal/connection")
    suspend fun getPortalConnection(
        @Header("Authorization") token: String
    ): Response<Any>
}
