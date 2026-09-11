// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'dashboard.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$DashboardUser {

 String get firstName; String get lastName; String get kycStatus;
/// Create a copy of DashboardUser
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DashboardUserCopyWith<DashboardUser> get copyWith => _$DashboardUserCopyWithImpl<DashboardUser>(this as DashboardUser, _$identity);

  /// Serializes this DashboardUser to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DashboardUser&&(identical(other.firstName, firstName) || other.firstName == firstName)&&(identical(other.lastName, lastName) || other.lastName == lastName)&&(identical(other.kycStatus, kycStatus) || other.kycStatus == kycStatus));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,firstName,lastName,kycStatus);

@override
String toString() {
  return 'DashboardUser(firstName: $firstName, lastName: $lastName, kycStatus: $kycStatus)';
}


}

/// @nodoc
abstract mixin class $DashboardUserCopyWith<$Res>  {
  factory $DashboardUserCopyWith(DashboardUser value, $Res Function(DashboardUser) _then) = _$DashboardUserCopyWithImpl;
@useResult
$Res call({
 String firstName, String lastName, String kycStatus
});




}
/// @nodoc
class _$DashboardUserCopyWithImpl<$Res>
    implements $DashboardUserCopyWith<$Res> {
  _$DashboardUserCopyWithImpl(this._self, this._then);

  final DashboardUser _self;
  final $Res Function(DashboardUser) _then;

/// Create a copy of DashboardUser
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? firstName = null,Object? lastName = null,Object? kycStatus = null,}) {
  return _then(_self.copyWith(
firstName: null == firstName ? _self.firstName : firstName // ignore: cast_nullable_to_non_nullable
as String,lastName: null == lastName ? _self.lastName : lastName // ignore: cast_nullable_to_non_nullable
as String,kycStatus: null == kycStatus ? _self.kycStatus : kycStatus // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [DashboardUser].
extension DashboardUserPatterns on DashboardUser {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _DashboardUser value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _DashboardUser() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _DashboardUser value)  $default,){
final _that = this;
switch (_that) {
case _DashboardUser():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _DashboardUser value)?  $default,){
final _that = this;
switch (_that) {
case _DashboardUser() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String firstName,  String lastName,  String kycStatus)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _DashboardUser() when $default != null:
return $default(_that.firstName,_that.lastName,_that.kycStatus);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String firstName,  String lastName,  String kycStatus)  $default,) {final _that = this;
switch (_that) {
case _DashboardUser():
return $default(_that.firstName,_that.lastName,_that.kycStatus);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String firstName,  String lastName,  String kycStatus)?  $default,) {final _that = this;
switch (_that) {
case _DashboardUser() when $default != null:
return $default(_that.firstName,_that.lastName,_that.kycStatus);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _DashboardUser implements DashboardUser {
  const _DashboardUser({required this.firstName, required this.lastName, required this.kycStatus});
  factory _DashboardUser.fromJson(Map<String, dynamic> json) => _$DashboardUserFromJson(json);

@override final  String firstName;
@override final  String lastName;
@override final  String kycStatus;

/// Create a copy of DashboardUser
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DashboardUserCopyWith<_DashboardUser> get copyWith => __$DashboardUserCopyWithImpl<_DashboardUser>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DashboardUserToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _DashboardUser&&(identical(other.firstName, firstName) || other.firstName == firstName)&&(identical(other.lastName, lastName) || other.lastName == lastName)&&(identical(other.kycStatus, kycStatus) || other.kycStatus == kycStatus));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,firstName,lastName,kycStatus);

@override
String toString() {
  return 'DashboardUser(firstName: $firstName, lastName: $lastName, kycStatus: $kycStatus)';
}


}

/// @nodoc
abstract mixin class _$DashboardUserCopyWith<$Res> implements $DashboardUserCopyWith<$Res> {
  factory _$DashboardUserCopyWith(_DashboardUser value, $Res Function(_DashboardUser) _then) = __$DashboardUserCopyWithImpl;
@override @useResult
$Res call({
 String firstName, String lastName, String kycStatus
});




}
/// @nodoc
class __$DashboardUserCopyWithImpl<$Res>
    implements _$DashboardUserCopyWith<$Res> {
  __$DashboardUserCopyWithImpl(this._self, this._then);

  final _DashboardUser _self;
  final $Res Function(_DashboardUser) _then;

/// Create a copy of DashboardUser
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? firstName = null,Object? lastName = null,Object? kycStatus = null,}) {
  return _then(_DashboardUser(
firstName: null == firstName ? _self.firstName : firstName // ignore: cast_nullable_to_non_nullable
as String,lastName: null == lastName ? _self.lastName : lastName // ignore: cast_nullable_to_non_nullable
as String,kycStatus: null == kycStatus ? _self.kycStatus : kycStatus // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$WalletSummary {

 String get status; Money get availableBalance; Money get reservedBalance; DateTime get updatedAt;
/// Create a copy of WalletSummary
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$WalletSummaryCopyWith<WalletSummary> get copyWith => _$WalletSummaryCopyWithImpl<WalletSummary>(this as WalletSummary, _$identity);

  /// Serializes this WalletSummary to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is WalletSummary&&(identical(other.status, status) || other.status == status)&&(identical(other.availableBalance, availableBalance) || other.availableBalance == availableBalance)&&(identical(other.reservedBalance, reservedBalance) || other.reservedBalance == reservedBalance)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,status,availableBalance,reservedBalance,updatedAt);

@override
String toString() {
  return 'WalletSummary(status: $status, availableBalance: $availableBalance, reservedBalance: $reservedBalance, updatedAt: $updatedAt)';
}


}

/// @nodoc
abstract mixin class $WalletSummaryCopyWith<$Res>  {
  factory $WalletSummaryCopyWith(WalletSummary value, $Res Function(WalletSummary) _then) = _$WalletSummaryCopyWithImpl;
@useResult
$Res call({
 String status, Money availableBalance, Money reservedBalance, DateTime updatedAt
});


$MoneyCopyWith<$Res> get availableBalance;$MoneyCopyWith<$Res> get reservedBalance;

}
/// @nodoc
class _$WalletSummaryCopyWithImpl<$Res>
    implements $WalletSummaryCopyWith<$Res> {
  _$WalletSummaryCopyWithImpl(this._self, this._then);

  final WalletSummary _self;
  final $Res Function(WalletSummary) _then;

/// Create a copy of WalletSummary
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? status = null,Object? availableBalance = null,Object? reservedBalance = null,Object? updatedAt = null,}) {
  return _then(_self.copyWith(
status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,availableBalance: null == availableBalance ? _self.availableBalance : availableBalance // ignore: cast_nullable_to_non_nullable
as Money,reservedBalance: null == reservedBalance ? _self.reservedBalance : reservedBalance // ignore: cast_nullable_to_non_nullable
as Money,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}
/// Create a copy of WalletSummary
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$MoneyCopyWith<$Res> get availableBalance {
  
  return $MoneyCopyWith<$Res>(_self.availableBalance, (value) {
    return _then(_self.copyWith(availableBalance: value));
  });
}/// Create a copy of WalletSummary
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$MoneyCopyWith<$Res> get reservedBalance {
  
  return $MoneyCopyWith<$Res>(_self.reservedBalance, (value) {
    return _then(_self.copyWith(reservedBalance: value));
  });
}
}


/// Adds pattern-matching-related methods to [WalletSummary].
extension WalletSummaryPatterns on WalletSummary {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _WalletSummary value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _WalletSummary() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _WalletSummary value)  $default,){
final _that = this;
switch (_that) {
case _WalletSummary():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _WalletSummary value)?  $default,){
final _that = this;
switch (_that) {
case _WalletSummary() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String status,  Money availableBalance,  Money reservedBalance,  DateTime updatedAt)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _WalletSummary() when $default != null:
return $default(_that.status,_that.availableBalance,_that.reservedBalance,_that.updatedAt);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String status,  Money availableBalance,  Money reservedBalance,  DateTime updatedAt)  $default,) {final _that = this;
switch (_that) {
case _WalletSummary():
return $default(_that.status,_that.availableBalance,_that.reservedBalance,_that.updatedAt);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String status,  Money availableBalance,  Money reservedBalance,  DateTime updatedAt)?  $default,) {final _that = this;
switch (_that) {
case _WalletSummary() when $default != null:
return $default(_that.status,_that.availableBalance,_that.reservedBalance,_that.updatedAt);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _WalletSummary implements WalletSummary {
  const _WalletSummary({required this.status, required this.availableBalance, required this.reservedBalance, required this.updatedAt});
  factory _WalletSummary.fromJson(Map<String, dynamic> json) => _$WalletSummaryFromJson(json);

@override final  String status;
@override final  Money availableBalance;
@override final  Money reservedBalance;
@override final  DateTime updatedAt;

/// Create a copy of WalletSummary
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$WalletSummaryCopyWith<_WalletSummary> get copyWith => __$WalletSummaryCopyWithImpl<_WalletSummary>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$WalletSummaryToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _WalletSummary&&(identical(other.status, status) || other.status == status)&&(identical(other.availableBalance, availableBalance) || other.availableBalance == availableBalance)&&(identical(other.reservedBalance, reservedBalance) || other.reservedBalance == reservedBalance)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,status,availableBalance,reservedBalance,updatedAt);

@override
String toString() {
  return 'WalletSummary(status: $status, availableBalance: $availableBalance, reservedBalance: $reservedBalance, updatedAt: $updatedAt)';
}


}

/// @nodoc
abstract mixin class _$WalletSummaryCopyWith<$Res> implements $WalletSummaryCopyWith<$Res> {
  factory _$WalletSummaryCopyWith(_WalletSummary value, $Res Function(_WalletSummary) _then) = __$WalletSummaryCopyWithImpl;
@override @useResult
$Res call({
 String status, Money availableBalance, Money reservedBalance, DateTime updatedAt
});


@override $MoneyCopyWith<$Res> get availableBalance;@override $MoneyCopyWith<$Res> get reservedBalance;

}
/// @nodoc
class __$WalletSummaryCopyWithImpl<$Res>
    implements _$WalletSummaryCopyWith<$Res> {
  __$WalletSummaryCopyWithImpl(this._self, this._then);

  final _WalletSummary _self;
  final $Res Function(_WalletSummary) _then;

/// Create a copy of WalletSummary
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? status = null,Object? availableBalance = null,Object? reservedBalance = null,Object? updatedAt = null,}) {
  return _then(_WalletSummary(
status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,availableBalance: null == availableBalance ? _self.availableBalance : availableBalance // ignore: cast_nullable_to_non_nullable
as Money,reservedBalance: null == reservedBalance ? _self.reservedBalance : reservedBalance // ignore: cast_nullable_to_non_nullable
as Money,updatedAt: null == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as DateTime,
  ));
}

/// Create a copy of WalletSummary
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$MoneyCopyWith<$Res> get availableBalance {
  
  return $MoneyCopyWith<$Res>(_self.availableBalance, (value) {
    return _then(_self.copyWith(availableBalance: value));
  });
}/// Create a copy of WalletSummary
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$MoneyCopyWith<$Res> get reservedBalance {
  
  return $MoneyCopyWith<$Res>(_self.reservedBalance, (value) {
    return _then(_self.copyWith(reservedBalance: value));
  });
}
}


/// @nodoc
mixin _$AlertAction {

 String get label; String get deepLink;
/// Create a copy of AlertAction
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$AlertActionCopyWith<AlertAction> get copyWith => _$AlertActionCopyWithImpl<AlertAction>(this as AlertAction, _$identity);

  /// Serializes this AlertAction to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is AlertAction&&(identical(other.label, label) || other.label == label)&&(identical(other.deepLink, deepLink) || other.deepLink == deepLink));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,label,deepLink);

@override
String toString() {
  return 'AlertAction(label: $label, deepLink: $deepLink)';
}


}

/// @nodoc
abstract mixin class $AlertActionCopyWith<$Res>  {
  factory $AlertActionCopyWith(AlertAction value, $Res Function(AlertAction) _then) = _$AlertActionCopyWithImpl;
@useResult
$Res call({
 String label, String deepLink
});




}
/// @nodoc
class _$AlertActionCopyWithImpl<$Res>
    implements $AlertActionCopyWith<$Res> {
  _$AlertActionCopyWithImpl(this._self, this._then);

  final AlertAction _self;
  final $Res Function(AlertAction) _then;

/// Create a copy of AlertAction
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? label = null,Object? deepLink = null,}) {
  return _then(_self.copyWith(
label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,deepLink: null == deepLink ? _self.deepLink : deepLink // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [AlertAction].
extension AlertActionPatterns on AlertAction {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _AlertAction value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _AlertAction() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _AlertAction value)  $default,){
final _that = this;
switch (_that) {
case _AlertAction():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _AlertAction value)?  $default,){
final _that = this;
switch (_that) {
case _AlertAction() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String label,  String deepLink)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _AlertAction() when $default != null:
return $default(_that.label,_that.deepLink);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String label,  String deepLink)  $default,) {final _that = this;
switch (_that) {
case _AlertAction():
return $default(_that.label,_that.deepLink);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String label,  String deepLink)?  $default,) {final _that = this;
switch (_that) {
case _AlertAction() when $default != null:
return $default(_that.label,_that.deepLink);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _AlertAction implements AlertAction {
  const _AlertAction({required this.label, required this.deepLink});
  factory _AlertAction.fromJson(Map<String, dynamic> json) => _$AlertActionFromJson(json);

@override final  String label;
@override final  String deepLink;

/// Create a copy of AlertAction
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$AlertActionCopyWith<_AlertAction> get copyWith => __$AlertActionCopyWithImpl<_AlertAction>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$AlertActionToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _AlertAction&&(identical(other.label, label) || other.label == label)&&(identical(other.deepLink, deepLink) || other.deepLink == deepLink));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,label,deepLink);

@override
String toString() {
  return 'AlertAction(label: $label, deepLink: $deepLink)';
}


}

/// @nodoc
abstract mixin class _$AlertActionCopyWith<$Res> implements $AlertActionCopyWith<$Res> {
  factory _$AlertActionCopyWith(_AlertAction value, $Res Function(_AlertAction) _then) = __$AlertActionCopyWithImpl;
@override @useResult
$Res call({
 String label, String deepLink
});




}
/// @nodoc
class __$AlertActionCopyWithImpl<$Res>
    implements _$AlertActionCopyWith<$Res> {
  __$AlertActionCopyWithImpl(this._self, this._then);

  final _AlertAction _self;
  final $Res Function(_AlertAction) _then;

/// Create a copy of AlertAction
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? label = null,Object? deepLink = null,}) {
  return _then(_AlertAction(
label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,deepLink: null == deepLink ? _self.deepLink : deepLink // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$DashboardAlert {

 String get code; String get severity; String get title; String get message; AlertAction? get action;
/// Create a copy of DashboardAlert
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DashboardAlertCopyWith<DashboardAlert> get copyWith => _$DashboardAlertCopyWithImpl<DashboardAlert>(this as DashboardAlert, _$identity);

  /// Serializes this DashboardAlert to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DashboardAlert&&(identical(other.code, code) || other.code == code)&&(identical(other.severity, severity) || other.severity == severity)&&(identical(other.title, title) || other.title == title)&&(identical(other.message, message) || other.message == message)&&(identical(other.action, action) || other.action == action));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,code,severity,title,message,action);

@override
String toString() {
  return 'DashboardAlert(code: $code, severity: $severity, title: $title, message: $message, action: $action)';
}


}

/// @nodoc
abstract mixin class $DashboardAlertCopyWith<$Res>  {
  factory $DashboardAlertCopyWith(DashboardAlert value, $Res Function(DashboardAlert) _then) = _$DashboardAlertCopyWithImpl;
@useResult
$Res call({
 String code, String severity, String title, String message, AlertAction? action
});


$AlertActionCopyWith<$Res>? get action;

}
/// @nodoc
class _$DashboardAlertCopyWithImpl<$Res>
    implements $DashboardAlertCopyWith<$Res> {
  _$DashboardAlertCopyWithImpl(this._self, this._then);

  final DashboardAlert _self;
  final $Res Function(DashboardAlert) _then;

/// Create a copy of DashboardAlert
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? code = null,Object? severity = null,Object? title = null,Object? message = null,Object? action = freezed,}) {
  return _then(_self.copyWith(
code: null == code ? _self.code : code // ignore: cast_nullable_to_non_nullable
as String,severity: null == severity ? _self.severity : severity // ignore: cast_nullable_to_non_nullable
as String,title: null == title ? _self.title : title // ignore: cast_nullable_to_non_nullable
as String,message: null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,action: freezed == action ? _self.action : action // ignore: cast_nullable_to_non_nullable
as AlertAction?,
  ));
}
/// Create a copy of DashboardAlert
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$AlertActionCopyWith<$Res>? get action {
    if (_self.action == null) {
    return null;
  }

  return $AlertActionCopyWith<$Res>(_self.action!, (value) {
    return _then(_self.copyWith(action: value));
  });
}
}


/// Adds pattern-matching-related methods to [DashboardAlert].
extension DashboardAlertPatterns on DashboardAlert {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _DashboardAlert value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _DashboardAlert() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _DashboardAlert value)  $default,){
final _that = this;
switch (_that) {
case _DashboardAlert():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _DashboardAlert value)?  $default,){
final _that = this;
switch (_that) {
case _DashboardAlert() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String code,  String severity,  String title,  String message,  AlertAction? action)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _DashboardAlert() when $default != null:
return $default(_that.code,_that.severity,_that.title,_that.message,_that.action);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String code,  String severity,  String title,  String message,  AlertAction? action)  $default,) {final _that = this;
switch (_that) {
case _DashboardAlert():
return $default(_that.code,_that.severity,_that.title,_that.message,_that.action);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String code,  String severity,  String title,  String message,  AlertAction? action)?  $default,) {final _that = this;
switch (_that) {
case _DashboardAlert() when $default != null:
return $default(_that.code,_that.severity,_that.title,_that.message,_that.action);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _DashboardAlert implements DashboardAlert {
  const _DashboardAlert({required this.code, required this.severity, required this.title, required this.message, this.action});
  factory _DashboardAlert.fromJson(Map<String, dynamic> json) => _$DashboardAlertFromJson(json);

@override final  String code;
@override final  String severity;
@override final  String title;
@override final  String message;
@override final  AlertAction? action;

/// Create a copy of DashboardAlert
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DashboardAlertCopyWith<_DashboardAlert> get copyWith => __$DashboardAlertCopyWithImpl<_DashboardAlert>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DashboardAlertToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _DashboardAlert&&(identical(other.code, code) || other.code == code)&&(identical(other.severity, severity) || other.severity == severity)&&(identical(other.title, title) || other.title == title)&&(identical(other.message, message) || other.message == message)&&(identical(other.action, action) || other.action == action));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,code,severity,title,message,action);

@override
String toString() {
  return 'DashboardAlert(code: $code, severity: $severity, title: $title, message: $message, action: $action)';
}


}

/// @nodoc
abstract mixin class _$DashboardAlertCopyWith<$Res> implements $DashboardAlertCopyWith<$Res> {
  factory _$DashboardAlertCopyWith(_DashboardAlert value, $Res Function(_DashboardAlert) _then) = __$DashboardAlertCopyWithImpl;
@override @useResult
$Res call({
 String code, String severity, String title, String message, AlertAction? action
});


@override $AlertActionCopyWith<$Res>? get action;

}
/// @nodoc
class __$DashboardAlertCopyWithImpl<$Res>
    implements _$DashboardAlertCopyWith<$Res> {
  __$DashboardAlertCopyWithImpl(this._self, this._then);

  final _DashboardAlert _self;
  final $Res Function(_DashboardAlert) _then;

/// Create a copy of DashboardAlert
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? code = null,Object? severity = null,Object? title = null,Object? message = null,Object? action = freezed,}) {
  return _then(_DashboardAlert(
code: null == code ? _self.code : code // ignore: cast_nullable_to_non_nullable
as String,severity: null == severity ? _self.severity : severity // ignore: cast_nullable_to_non_nullable
as String,title: null == title ? _self.title : title // ignore: cast_nullable_to_non_nullable
as String,message: null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,action: freezed == action ? _self.action : action // ignore: cast_nullable_to_non_nullable
as AlertAction?,
  ));
}

/// Create a copy of DashboardAlert
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$AlertActionCopyWith<$Res>? get action {
    if (_self.action == null) {
    return null;
  }

  return $AlertActionCopyWith<$Res>(_self.action!, (value) {
    return _then(_self.copyWith(action: value));
  });
}
}


/// @nodoc
mixin _$Dashboard {

 DateTime get generatedAt; DashboardUser get user; WalletSummary get wallet; Map<String, dynamic>? get contribution; Map<String, dynamic>? get eligibility; Map<String, dynamic>? get nextDraw; Map<String, dynamic>? get training; Map<String, dynamic>? get solidarity; List<DashboardAlert> get alerts; Map<String, bool> get features;
/// Create a copy of Dashboard
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DashboardCopyWith<Dashboard> get copyWith => _$DashboardCopyWithImpl<Dashboard>(this as Dashboard, _$identity);

  /// Serializes this Dashboard to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Dashboard&&(identical(other.generatedAt, generatedAt) || other.generatedAt == generatedAt)&&(identical(other.user, user) || other.user == user)&&(identical(other.wallet, wallet) || other.wallet == wallet)&&const DeepCollectionEquality().equals(other.contribution, contribution)&&const DeepCollectionEquality().equals(other.eligibility, eligibility)&&const DeepCollectionEquality().equals(other.nextDraw, nextDraw)&&const DeepCollectionEquality().equals(other.training, training)&&const DeepCollectionEquality().equals(other.solidarity, solidarity)&&const DeepCollectionEquality().equals(other.alerts, alerts)&&const DeepCollectionEquality().equals(other.features, features));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,generatedAt,user,wallet,const DeepCollectionEquality().hash(contribution),const DeepCollectionEquality().hash(eligibility),const DeepCollectionEquality().hash(nextDraw),const DeepCollectionEquality().hash(training),const DeepCollectionEquality().hash(solidarity),const DeepCollectionEquality().hash(alerts),const DeepCollectionEquality().hash(features));

@override
String toString() {
  return 'Dashboard(generatedAt: $generatedAt, user: $user, wallet: $wallet, contribution: $contribution, eligibility: $eligibility, nextDraw: $nextDraw, training: $training, solidarity: $solidarity, alerts: $alerts, features: $features)';
}


}

/// @nodoc
abstract mixin class $DashboardCopyWith<$Res>  {
  factory $DashboardCopyWith(Dashboard value, $Res Function(Dashboard) _then) = _$DashboardCopyWithImpl;
@useResult
$Res call({
 DateTime generatedAt, DashboardUser user, WalletSummary wallet, Map<String, dynamic>? contribution, Map<String, dynamic>? eligibility, Map<String, dynamic>? nextDraw, Map<String, dynamic>? training, Map<String, dynamic>? solidarity, List<DashboardAlert> alerts, Map<String, bool> features
});


$DashboardUserCopyWith<$Res> get user;$WalletSummaryCopyWith<$Res> get wallet;

}
/// @nodoc
class _$DashboardCopyWithImpl<$Res>
    implements $DashboardCopyWith<$Res> {
  _$DashboardCopyWithImpl(this._self, this._then);

  final Dashboard _self;
  final $Res Function(Dashboard) _then;

/// Create a copy of Dashboard
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? generatedAt = null,Object? user = null,Object? wallet = null,Object? contribution = freezed,Object? eligibility = freezed,Object? nextDraw = freezed,Object? training = freezed,Object? solidarity = freezed,Object? alerts = null,Object? features = null,}) {
  return _then(_self.copyWith(
generatedAt: null == generatedAt ? _self.generatedAt : generatedAt // ignore: cast_nullable_to_non_nullable
as DateTime,user: null == user ? _self.user : user // ignore: cast_nullable_to_non_nullable
as DashboardUser,wallet: null == wallet ? _self.wallet : wallet // ignore: cast_nullable_to_non_nullable
as WalletSummary,contribution: freezed == contribution ? _self.contribution : contribution // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,eligibility: freezed == eligibility ? _self.eligibility : eligibility // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,nextDraw: freezed == nextDraw ? _self.nextDraw : nextDraw // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,training: freezed == training ? _self.training : training // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,solidarity: freezed == solidarity ? _self.solidarity : solidarity // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,alerts: null == alerts ? _self.alerts : alerts // ignore: cast_nullable_to_non_nullable
as List<DashboardAlert>,features: null == features ? _self.features : features // ignore: cast_nullable_to_non_nullable
as Map<String, bool>,
  ));
}
/// Create a copy of Dashboard
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$DashboardUserCopyWith<$Res> get user {
  
  return $DashboardUserCopyWith<$Res>(_self.user, (value) {
    return _then(_self.copyWith(user: value));
  });
}/// Create a copy of Dashboard
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$WalletSummaryCopyWith<$Res> get wallet {
  
  return $WalletSummaryCopyWith<$Res>(_self.wallet, (value) {
    return _then(_self.copyWith(wallet: value));
  });
}
}


/// Adds pattern-matching-related methods to [Dashboard].
extension DashboardPatterns on Dashboard {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Dashboard value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Dashboard() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Dashboard value)  $default,){
final _that = this;
switch (_that) {
case _Dashboard():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Dashboard value)?  $default,){
final _that = this;
switch (_that) {
case _Dashboard() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( DateTime generatedAt,  DashboardUser user,  WalletSummary wallet,  Map<String, dynamic>? contribution,  Map<String, dynamic>? eligibility,  Map<String, dynamic>? nextDraw,  Map<String, dynamic>? training,  Map<String, dynamic>? solidarity,  List<DashboardAlert> alerts,  Map<String, bool> features)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Dashboard() when $default != null:
return $default(_that.generatedAt,_that.user,_that.wallet,_that.contribution,_that.eligibility,_that.nextDraw,_that.training,_that.solidarity,_that.alerts,_that.features);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( DateTime generatedAt,  DashboardUser user,  WalletSummary wallet,  Map<String, dynamic>? contribution,  Map<String, dynamic>? eligibility,  Map<String, dynamic>? nextDraw,  Map<String, dynamic>? training,  Map<String, dynamic>? solidarity,  List<DashboardAlert> alerts,  Map<String, bool> features)  $default,) {final _that = this;
switch (_that) {
case _Dashboard():
return $default(_that.generatedAt,_that.user,_that.wallet,_that.contribution,_that.eligibility,_that.nextDraw,_that.training,_that.solidarity,_that.alerts,_that.features);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( DateTime generatedAt,  DashboardUser user,  WalletSummary wallet,  Map<String, dynamic>? contribution,  Map<String, dynamic>? eligibility,  Map<String, dynamic>? nextDraw,  Map<String, dynamic>? training,  Map<String, dynamic>? solidarity,  List<DashboardAlert> alerts,  Map<String, bool> features)?  $default,) {final _that = this;
switch (_that) {
case _Dashboard() when $default != null:
return $default(_that.generatedAt,_that.user,_that.wallet,_that.contribution,_that.eligibility,_that.nextDraw,_that.training,_that.solidarity,_that.alerts,_that.features);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Dashboard extends Dashboard {
  const _Dashboard({required this.generatedAt, required this.user, required this.wallet, final  Map<String, dynamic>? contribution, final  Map<String, dynamic>? eligibility, final  Map<String, dynamic>? nextDraw, final  Map<String, dynamic>? training, final  Map<String, dynamic>? solidarity, required final  List<DashboardAlert> alerts, required final  Map<String, bool> features}): _contribution = contribution,_eligibility = eligibility,_nextDraw = nextDraw,_training = training,_solidarity = solidarity,_alerts = alerts,_features = features,super._();
  factory _Dashboard.fromJson(Map<String, dynamic> json) => _$DashboardFromJson(json);

@override final  DateTime generatedAt;
@override final  DashboardUser user;
@override final  WalletSummary wallet;
 final  Map<String, dynamic>? _contribution;
@override Map<String, dynamic>? get contribution {
  final value = _contribution;
  if (value == null) return null;
  if (_contribution is EqualUnmodifiableMapView) return _contribution;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(value);
}

 final  Map<String, dynamic>? _eligibility;
@override Map<String, dynamic>? get eligibility {
  final value = _eligibility;
  if (value == null) return null;
  if (_eligibility is EqualUnmodifiableMapView) return _eligibility;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(value);
}

 final  Map<String, dynamic>? _nextDraw;
@override Map<String, dynamic>? get nextDraw {
  final value = _nextDraw;
  if (value == null) return null;
  if (_nextDraw is EqualUnmodifiableMapView) return _nextDraw;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(value);
}

 final  Map<String, dynamic>? _training;
@override Map<String, dynamic>? get training {
  final value = _training;
  if (value == null) return null;
  if (_training is EqualUnmodifiableMapView) return _training;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(value);
}

 final  Map<String, dynamic>? _solidarity;
@override Map<String, dynamic>? get solidarity {
  final value = _solidarity;
  if (value == null) return null;
  if (_solidarity is EqualUnmodifiableMapView) return _solidarity;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(value);
}

 final  List<DashboardAlert> _alerts;
@override List<DashboardAlert> get alerts {
  if (_alerts is EqualUnmodifiableListView) return _alerts;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_alerts);
}

 final  Map<String, bool> _features;
@override Map<String, bool> get features {
  if (_features is EqualUnmodifiableMapView) return _features;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_features);
}


/// Create a copy of Dashboard
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DashboardCopyWith<_Dashboard> get copyWith => __$DashboardCopyWithImpl<_Dashboard>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DashboardToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Dashboard&&(identical(other.generatedAt, generatedAt) || other.generatedAt == generatedAt)&&(identical(other.user, user) || other.user == user)&&(identical(other.wallet, wallet) || other.wallet == wallet)&&const DeepCollectionEquality().equals(other._contribution, _contribution)&&const DeepCollectionEquality().equals(other._eligibility, _eligibility)&&const DeepCollectionEquality().equals(other._nextDraw, _nextDraw)&&const DeepCollectionEquality().equals(other._training, _training)&&const DeepCollectionEquality().equals(other._solidarity, _solidarity)&&const DeepCollectionEquality().equals(other._alerts, _alerts)&&const DeepCollectionEquality().equals(other._features, _features));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,generatedAt,user,wallet,const DeepCollectionEquality().hash(_contribution),const DeepCollectionEquality().hash(_eligibility),const DeepCollectionEquality().hash(_nextDraw),const DeepCollectionEquality().hash(_training),const DeepCollectionEquality().hash(_solidarity),const DeepCollectionEquality().hash(_alerts),const DeepCollectionEquality().hash(_features));

@override
String toString() {
  return 'Dashboard(generatedAt: $generatedAt, user: $user, wallet: $wallet, contribution: $contribution, eligibility: $eligibility, nextDraw: $nextDraw, training: $training, solidarity: $solidarity, alerts: $alerts, features: $features)';
}


}

/// @nodoc
abstract mixin class _$DashboardCopyWith<$Res> implements $DashboardCopyWith<$Res> {
  factory _$DashboardCopyWith(_Dashboard value, $Res Function(_Dashboard) _then) = __$DashboardCopyWithImpl;
@override @useResult
$Res call({
 DateTime generatedAt, DashboardUser user, WalletSummary wallet, Map<String, dynamic>? contribution, Map<String, dynamic>? eligibility, Map<String, dynamic>? nextDraw, Map<String, dynamic>? training, Map<String, dynamic>? solidarity, List<DashboardAlert> alerts, Map<String, bool> features
});


@override $DashboardUserCopyWith<$Res> get user;@override $WalletSummaryCopyWith<$Res> get wallet;

}
/// @nodoc
class __$DashboardCopyWithImpl<$Res>
    implements _$DashboardCopyWith<$Res> {
  __$DashboardCopyWithImpl(this._self, this._then);

  final _Dashboard _self;
  final $Res Function(_Dashboard) _then;

/// Create a copy of Dashboard
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? generatedAt = null,Object? user = null,Object? wallet = null,Object? contribution = freezed,Object? eligibility = freezed,Object? nextDraw = freezed,Object? training = freezed,Object? solidarity = freezed,Object? alerts = null,Object? features = null,}) {
  return _then(_Dashboard(
generatedAt: null == generatedAt ? _self.generatedAt : generatedAt // ignore: cast_nullable_to_non_nullable
as DateTime,user: null == user ? _self.user : user // ignore: cast_nullable_to_non_nullable
as DashboardUser,wallet: null == wallet ? _self.wallet : wallet // ignore: cast_nullable_to_non_nullable
as WalletSummary,contribution: freezed == contribution ? _self._contribution : contribution // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,eligibility: freezed == eligibility ? _self._eligibility : eligibility // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,nextDraw: freezed == nextDraw ? _self._nextDraw : nextDraw // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,training: freezed == training ? _self._training : training // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,solidarity: freezed == solidarity ? _self._solidarity : solidarity // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,alerts: null == alerts ? _self._alerts : alerts // ignore: cast_nullable_to_non_nullable
as List<DashboardAlert>,features: null == features ? _self._features : features // ignore: cast_nullable_to_non_nullable
as Map<String, bool>,
  ));
}

/// Create a copy of Dashboard
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$DashboardUserCopyWith<$Res> get user {
  
  return $DashboardUserCopyWith<$Res>(_self.user, (value) {
    return _then(_self.copyWith(user: value));
  });
}/// Create a copy of Dashboard
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$WalletSummaryCopyWith<$Res> get wallet {
  
  return $WalletSummaryCopyWith<$Res>(_self.wallet, (value) {
    return _then(_self.copyWith(wallet: value));
  });
}
}

// dart format on
