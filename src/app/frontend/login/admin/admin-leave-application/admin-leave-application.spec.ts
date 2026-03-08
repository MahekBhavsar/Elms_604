import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminLeaveApplication } from './admin-leave-application';

describe('AdminLeaveApplication', () => {
  let component: AdminLeaveApplication;
  let fixture: ComponentFixture<AdminLeaveApplication>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminLeaveApplication]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminLeaveApplication);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
